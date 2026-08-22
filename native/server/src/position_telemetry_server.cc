#include "linuxcnc_grpc/position_telemetry_server.hpp"

#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/position_telemetry.hpp"
#include "linuxcnc_grpc/position_telemetry_wire.hpp"

#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/post.hpp>
#include <boost/asio/ssl/context.hpp>
#include <boost/asio/ssl/stream.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>

#include <atomic>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <type_traits>
#include <utility>

namespace linuxcnc::server {
namespace {

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;
using PlainStream = beast::tcp_stream;
using TlsStream = beast::ssl_stream<beast::tcp_stream>;

std::pair<std::string, std::string> split_endpoint(const std::string& endpoint) {
  const auto separator = endpoint.rfind(':');
  if (separator == std::string::npos) {
    throw std::invalid_argument("position telemetry endpoint must be HOST:PORT");
  }
  auto host = endpoint.substr(0, separator);
  if (host.size() > 1 && host.front() == '[' && host.back() == ']') {
    host = host.substr(1, host.size() - 2);
  }
  return {host, endpoint.substr(separator + 1)};
}

template <typename Stream>
class Session final : public std::enable_shared_from_this<Session<Stream>> {
 public:
  Session(Stream stream, std::shared_ptr<PositionTelemetry> telemetry,
          std::function<void()> release)
      : websocket_(std::move(stream)), telemetry_(std::move(telemetry)),
        release_(std::move(release)) {}

  void run() {
    if constexpr (std::is_same_v<Stream, TlsStream>) {
      websocket_.next_layer().async_handshake(
          asio::ssl::stream_base::server,
          beast::bind_front_handler(&Session::on_tls_handshake,
                                    this->shared_from_this()));
    } else {
      read_upgrade();
    }
  }

 private:
  void on_tls_handshake(beast::error_code error) {
    if (error) return fail();
    read_upgrade();
  }

  void read_upgrade() {
    http::async_read(websocket_.next_layer(), read_buffer_, request_,
                     beast::bind_front_handler(&Session::on_upgrade_request,
                                               this->shared_from_this()));
  }

  void on_upgrade_request(beast::error_code error, std::size_t) {
    if (error || request_.target() != "/v1/position-history" ||
        !websocket::is_upgrade(request_)) return fail();
    websocket_.binary(true);
    websocket_.read_message_max(1024);
    websocket_.set_option(websocket::stream_base::timeout::suggested(
        beast::role_type::server));
    websocket_.async_accept(
        request_, beast::bind_front_handler(&Session::on_accept,
                                            this->shared_from_this()));
  }

  void on_accept(beast::error_code error) {
    if (error) return fail();
    const std::weak_ptr<Session> weak = this->shared_from_this();
    subscription_ = telemetry_->subscribe([weak](const std::uint64_t&) {
      if (const auto self = weak.lock()) {
        asio::post(self->websocket_.get_executor(), [weak] {
          if (const auto session = weak.lock()) session->wake();
        });
      }
    });
    send_next(true);
    read_application_data();
  }

  void wake() {
    if (closed_) return;
    if (writing_) {
      dirty_ = true;
      return;
    }
    send_next(false);
  }

  void send_next(bool initial) {
    PositionHistoryBatch batch = initial
        ? telemetry_->snapshot()
        : telemetry_->since(cursor_, generation_);
    if (!initial && !batch.reset && batch.packed.empty()) return;
    const auto kind = (initial || batch.reset)
        ? PositionTelemetryFrameKind::Replacement
        : PositionTelemetryFrameKind::Delta;
    write_cursor_ = batch.next_sequence;
    write_generation_ = batch.generation;
    write_frame_ = encode_position_telemetry_frame(batch, kind);
    writing_ = true;
    websocket_.async_write(
        asio::buffer(write_frame_),
        beast::bind_front_handler(&Session::on_write,
                                  this->shared_from_this()));
  }

  void on_write(beast::error_code error, std::size_t) {
    writing_ = false;
    if (error) return fail();
    cursor_ = write_cursor_;
    generation_ = write_generation_;
    write_frame_.clear();
    if (closing_) return close_policy_violation();
    if (dirty_) {
      dirty_ = false;
      send_next(false);
    }
  }

  void read_application_data() {
    websocket_.async_read(
        read_buffer_, beast::bind_front_handler(&Session::on_read,
                                                this->shared_from_this()));
  }

  void on_read(beast::error_code error, std::size_t) {
    if (error == websocket::error::closed) return fail();
    if (error) return fail();
    closing_ = true;
    if (!writing_) close_policy_violation();
  }

  void close_policy_violation() {
    websocket::close_reason reason(websocket::close_code::policy_error);
    reason.reason = "position telemetry is server-to-client only";
    websocket_.async_close(
        reason, [self = this->shared_from_this()](beast::error_code) {
          self->fail();
        });
  }

  void fail() {
    if (closed_) return;
    closed_ = true;
    subscription_.reset();
    if (release_) {
      release_();
      release_ = {};
    }
    beast::error_code ignored;
    beast::get_lowest_layer(websocket_).socket().shutdown(
        tcp::socket::shutdown_both, ignored);
    beast::get_lowest_layer(websocket_).socket().close(ignored);
  }

  websocket::stream<Stream> websocket_;
  std::shared_ptr<PositionTelemetry> telemetry_;
  PositionTelemetry::Subscription subscription_;
  std::function<void()> release_;
  beast::flat_buffer read_buffer_;
  http::request<http::string_body> request_;
  std::vector<std::uint8_t> write_frame_;
  std::uint64_t cursor_ = 0;
  std::uint64_t generation_ = 0;
  std::uint64_t write_cursor_ = 0;
  std::uint64_t write_generation_ = 0;
  bool writing_ = false;
  bool dirty_ = false;
  bool closing_ = false;
  bool closed_ = false;
};

}  // namespace

class PositionTelemetryServer::Impl {
 public:
  Impl(const DaemonConfig& config,
       std::shared_ptr<PositionTelemetry> telemetry)
      : telemetry_(std::move(telemetry)),
        tls_(config.tls),
        ssl_(asio::ssl::context::tls_server),
        acceptor_(io_) {
    if (tls_) {
      ssl_.set_options(asio::ssl::context::default_workarounds |
                       asio::ssl::context::no_sslv2 |
                       asio::ssl::context::no_sslv3);
      ssl_.use_certificate_chain_file(config.tls_certificate.string());
      ssl_.use_private_key_file(config.tls_private_key.string(),
                                asio::ssl::context::pem);
      if (config.mtls) {
        ssl_.load_verify_file(config.tls_client_ca.string());
        ssl_.set_verify_mode(asio::ssl::verify_peer |
                             asio::ssl::verify_fail_if_no_peer_cert);
      }
    }
    const auto [host, port] = split_endpoint(config.position_telemetry_endpoint);
    tcp::resolver resolver(io_);
    const auto resolved = resolver.resolve(host, port);
    if (resolved.empty()) throw std::runtime_error("cannot resolve position telemetry endpoint");
    const auto endpoint = resolved.begin()->endpoint();
    acceptor_.open(endpoint.protocol());
    acceptor_.set_option(asio::socket_base::reuse_address(true));
    acceptor_.bind(endpoint);
    acceptor_.listen(asio::socket_base::max_listen_connections);
    accept();
    thread_ = std::thread([this] { io_.run(); });
  }

  ~Impl() { stop(); }

  void stop() {
    if (stopped_.exchange(true)) return;
    asio::post(io_, [this] {
      beast::error_code ignored;
      acceptor_.cancel(ignored);
      acceptor_.close(ignored);
    });
    io_.stop();
    if (thread_.joinable()) thread_.join();
  }

 private:
  void accept() {
    acceptor_.async_accept([this](beast::error_code error, tcp::socket socket) {
          if (!error) {
            if (active_sessions_.fetch_add(1) >= 128) {
              active_sessions_.fetch_sub(1);
              beast::error_code ignored;
              socket.close(ignored);
            } else if (tls_) {
              auto release = [this] { active_sessions_.fetch_sub(1); };
              std::make_shared<Session<TlsStream>>(
                  TlsStream(std::move(socket), ssl_), telemetry_,
                  std::move(release))->run();
            } else {
              auto release = [this] { active_sessions_.fetch_sub(1); };
              std::make_shared<Session<PlainStream>>(
                  PlainStream(std::move(socket)), telemetry_,
                  std::move(release))->run();
            }
          }
          if (!stopped_) accept();
        });
  }

  asio::io_context io_{1};
  std::shared_ptr<PositionTelemetry> telemetry_;
  bool tls_ = false;
  asio::ssl::context ssl_;
  tcp::acceptor acceptor_;
  std::atomic<bool> stopped_{false};
  std::atomic<std::size_t> active_sessions_{0};
  std::thread thread_;
};

PositionTelemetryServer::PositionTelemetryServer(
    const DaemonConfig& config, std::shared_ptr<PositionTelemetry> telemetry)
    : impl_(std::make_unique<Impl>(config, std::move(telemetry))) {}

PositionTelemetryServer::~PositionTelemetryServer() = default;

void PositionTelemetryServer::stop() { impl_->stop(); }

}  // namespace linuxcnc::server
