#include "linuxcnc_grpc/position_telemetry_server.hpp"

#include <atomic>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/post.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/websocket.hpp>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>

#include "linuxcnc_grpc/daemon_config.hpp"
#include "linuxcnc_grpc/hal_value_telemetry.hpp"
#include "linuxcnc_grpc/hal_value_telemetry_wire.hpp"
#include "linuxcnc_grpc/position_telemetry.hpp"
#include "linuxcnc_grpc/position_telemetry_wire.hpp"

namespace linuxcnc::server {
namespace {

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;
using PlainStream = beast::tcp_stream;

std::pair<std::string, std::string> split_endpoint(
    const std::string& endpoint) {
  const auto separator = endpoint.rfind(':');
  if (separator == std::string::npos) {
    throw std::invalid_argument("telemetry endpoint must be HOST:PORT");
  }
  auto host = endpoint.substr(0, separator);
  if (host.size() > 1 && host.front() == '[' && host.back() == ']') {
    host = host.substr(1, host.size() - 2);
  }
  return {host, endpoint.substr(separator + 1)};
}

class Session final : public std::enable_shared_from_this<Session> {
 public:
  Session(PlainStream stream, std::shared_ptr<PositionTelemetry> telemetry,
          std::shared_ptr<HalValueTelemetry> hal_telemetry,
          std::function<void()> release)
      : websocket_(std::move(stream)),
        telemetry_(std::move(telemetry)),
        hal_telemetry_(std::move(hal_telemetry)),
        release_(std::move(release)) {}

  void run() { read_upgrade(); }

 private:
  void read_upgrade() {
    http::async_read(websocket_.next_layer(), read_buffer_, request_,
                     beast::bind_front_handler(&Session::on_upgrade_request,
                                               this->shared_from_this()));
  }

  void on_upgrade_request(beast::error_code error, std::size_t) {
    if (error || !websocket::is_upgrade(request_)) return fail();
    const std::string target(request_.target());
    if (target == "/v1/position-history") {
      mode_ = Mode::Position;
    } else {
      const std::string prefix = "/v1/hal-values/";
      if (target.rfind(prefix, 0) != 0) return fail();
      auto claimed = hal_telemetry_->claim(target.substr(prefix.size()));
      if (!claimed) return fail();
      mode_ = Mode::Hal;
      hal_subscription_id_ = std::move(*claimed);
    }
    websocket_.binary(true);
    websocket_.read_message_max(1024);
    websocket_.set_option(
        websocket::stream_base::timeout::suggested(beast::role_type::server));
    websocket_.async_accept(
        request_, beast::bind_front_handler(&Session::on_accept,
                                            this->shared_from_this()));
  }

  void on_accept(beast::error_code error) {
    if (error) return fail();
    const std::weak_ptr<Session> weak = this->shared_from_this();
    const auto callback = [weak](const std::uint64_t&) {
      if (const auto self = weak.lock()) {
        asio::post(self->websocket_.get_executor(), [weak] {
          if (const auto session = weak.lock()) session->wake();
        });
      }
    };
    if (mode_ == Mode::Position) {
      position_subscription_ = telemetry_->subscribe(callback);
      send_next(true);
    } else {
      hal_subscription_ =
          hal_telemetry_->subscribe(hal_subscription_id_, callback);
      send_hal();
    }
    read_application_data();
  }

  void wake() {
    if (closed_) return;
    if (writing_) {
      dirty_ = true;
      return;
    }
    if (mode_ == Mode::Position)
      send_next(false);
    else
      send_hal();
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
    websocket_.async_write(asio::buffer(write_frame_),
                           beast::bind_front_handler(&Session::on_write,
                                                     this->shared_from_this()));
  }

  void send_hal() {
    const auto snapshot = hal_telemetry_->snapshot(hal_subscription_id_);
    if (!snapshot) return fail();
    if (!snapshot->sampled) return;
    const bool replacement = hal_revision_ != snapshot->revision;
    std::vector<std::size_t> changed;
    if (!replacement) {
      for (std::size_t index = 0; index < snapshot->values.size(); ++index) {
        if (index >= hal_values_.size() ||
            snapshot->values[index] != hal_values_[index])
          changed.push_back(index);
      }
      if (changed.empty()) return;
    }
    write_hal_snapshot_ = *snapshot;
    write_frame_ = encode_hal_telemetry_frame(
        *snapshot,
        replacement ? HalTelemetryFrameKind::Replacement
                    : HalTelemetryFrameKind::Delta,
        changed);
    writing_ = true;
    websocket_.async_write(asio::buffer(write_frame_),
                           beast::bind_front_handler(&Session::on_write,
                                                     this->shared_from_this()));
  }

  void on_write(beast::error_code error, std::size_t) {
    writing_ = false;
    if (error) return fail();
    cursor_ = write_cursor_;
    generation_ = write_generation_;
    if (write_hal_snapshot_) {
      hal_revision_ = write_hal_snapshot_->revision;
      hal_values_ = write_hal_snapshot_->values;
      write_hal_snapshot_.reset();
    }
    write_frame_.clear();
    if (closing_) return close_policy_violation();
    if (dirty_) {
      dirty_ = false;
      if (mode_ == Mode::Position)
        send_next(false);
      else
        send_hal();
    }
  }

  void read_application_data() {
    websocket_.async_read(
        read_buffer_,
        beast::bind_front_handler(&Session::on_read, this->shared_from_this()));
  }

  void on_read(beast::error_code error, std::size_t) {
    if (error == websocket::error::closed) return fail();
    if (error) return fail();
    closing_ = true;
    if (!writing_) close_policy_violation();
  }

  void close_policy_violation() {
    websocket::close_reason reason(websocket::close_code::policy_error);
    reason.reason = "telemetry is server-to-client only";
    websocket_.async_close(reason, [self = this->shared_from_this()](
                                       beast::error_code) { self->fail(); });
  }

  void fail() {
    if (closed_) return;
    closed_ = true;
    position_subscription_.reset();
    hal_subscription_.reset();
    if (!hal_subscription_id_.empty()) {
      hal_telemetry_->erase(hal_subscription_id_);
      hal_subscription_id_.clear();
    }
    if (release_) {
      release_();
      release_ = {};
    }
    beast::error_code ignored;
    beast::get_lowest_layer(websocket_)
        .socket()
        .shutdown(tcp::socket::shutdown_both, ignored);
    beast::get_lowest_layer(websocket_).socket().close(ignored);
  }

  websocket::stream<PlainStream> websocket_;
  std::shared_ptr<PositionTelemetry> telemetry_;
  std::shared_ptr<HalValueTelemetry> hal_telemetry_;
  PositionTelemetry::Subscription position_subscription_;
  HalValueTelemetry::Subscription hal_subscription_;
  std::function<void()> release_;
  beast::flat_buffer read_buffer_;
  http::request<http::string_body> request_;
  std::vector<std::uint8_t> write_frame_;
  std::optional<HalTelemetrySnapshot> write_hal_snapshot_;
  std::vector<std::optional<HalTelemetryValue>> hal_values_;
  std::string hal_subscription_id_;
  std::uint64_t hal_revision_ = 0;
  std::uint64_t cursor_ = 0;
  std::uint64_t generation_ = 0;
  std::uint64_t write_cursor_ = 0;
  std::uint64_t write_generation_ = 0;
  bool writing_ = false;
  bool dirty_ = false;
  bool closing_ = false;
  bool closed_ = false;
  enum class Mode { Position, Hal } mode_ = Mode::Position;
};

}  // namespace

class PositionTelemetryServer::Impl {
 public:
  Impl(const DaemonConfig& config, std::shared_ptr<PositionTelemetry> telemetry,
       std::shared_ptr<HalValueTelemetry> hal_telemetry)
      : telemetry_(std::move(telemetry)),
        hal_telemetry_(std::move(hal_telemetry)),
        acceptor_(io_) {
    const auto [host, port] = split_endpoint(config.telemetry_endpoint);
    tcp::resolver resolver(io_);
    const auto resolved = resolver.resolve(host, port);
    if (resolved.empty())
      throw std::runtime_error("cannot resolve telemetry endpoint");
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
        } else {
          auto release = [this] { active_sessions_.fetch_sub(1); };
          std::make_shared<Session>(PlainStream(std::move(socket)), telemetry_,
                                    hal_telemetry_, std::move(release))
              ->run();
        }
      }
      if (!stopped_) accept();
    });
  }

  asio::io_context io_{1};
  std::shared_ptr<PositionTelemetry> telemetry_;
  std::shared_ptr<HalValueTelemetry> hal_telemetry_;
  tcp::acceptor acceptor_;
  std::atomic<bool> stopped_{false};
  std::atomic<std::size_t> active_sessions_{0};
  std::thread thread_;
};

PositionTelemetryServer::PositionTelemetryServer(
    const DaemonConfig& config, std::shared_ptr<PositionTelemetry> telemetry,
    std::shared_ptr<HalValueTelemetry> hal_telemetry)
    : impl_(std::make_unique<Impl>(config, std::move(telemetry),
                                   std::move(hal_telemetry))) {}

PositionTelemetryServer::~PositionTelemetryServer() = default;

void PositionTelemetryServer::stop() { impl_->stop(); }

}  // namespace linuxcnc::server
