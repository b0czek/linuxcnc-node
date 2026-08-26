#include "linuxcnc_grpc/telemetry_websocket_server.hpp"

#include <algorithm>
#include <atomic>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/post.hpp>
#include <boost/asio/steady_timer.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/websocket.hpp>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>

#include "linuxcnc/v1/websocket.pb.h"
#include "linuxcnc_grpc/callback_runtime.hpp"
#include "linuxcnc_grpc/daemon/config.hpp"
#include "linuxcnc_grpc/gcode/parser.hpp"
#include "linuxcnc_grpc/hal/value_telemetry.hpp"
#include "linuxcnc_grpc/position/telemetry.hpp"
#include "linuxcnc_grpc/program/workspace.hpp"
#include "linuxcnc_grpc/protobuf_gcode_mapping.hpp"

namespace linuxcnc::server {
namespace {

namespace asio = boost::asio;
namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
using tcp = asio::ip::tcp;
using PlainStream = beast::tcp_stream;

constexpr auto kPositionDeliveryPeriod = std::chrono::milliseconds(50);
constexpr auto kWriteDeadline = std::chrono::seconds(5);
constexpr std::size_t kMaxSessions = 16;

linuxcnc::v1::FrameKind frame_kind(bool replacement) {
  return replacement ? linuxcnc::v1::FRAME_KIND_REPLACEMENT
                     : linuxcnc::v1::FRAME_KIND_DELTA;
}

std::string encode_position_frame(const PositionHistoryBatch& batch,
                                  bool replacement) {
  linuxcnc::v1::PositionHistoryFrame frame;
  frame.set_kind(frame_kind(replacement));
  frame.set_generation(batch.generation);
  frame.set_first_sequence(batch.first_sequence);
  frame.set_next_sequence(batch.next_sequence);
  frame.set_replacement_count(replacement ? 0 : batch.replace_count);
  for (const auto value : batch.packed) frame.add_values(value);
  return frame.SerializeAsString();
}

void encode_hal_scalar(const HalTelemetryValue& source,
                       linuxcnc::v1::HalScalar* target) {
  if (const auto* value = std::get_if<bool>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_BIT);
    target->set_bit(*value);
  } else if (const auto* value = std::get_if<double>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_FLOAT);
    target->set_float_value(*value);
  } else if (const auto* value = std::get_if<std::int32_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_S32);
    target->set_s32(*value);
  } else if (const auto* value = std::get_if<std::uint32_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_U32);
    target->set_u32(*value);
  } else if (const auto* value = std::get_if<std::int64_t>(&source)) {
    target->set_type(linuxcnc::v1::HAL_TYPE_S64);
    target->set_s64(*value);
  } else {
    target->set_type(linuxcnc::v1::HAL_TYPE_U64);
    target->set_u64(std::get<std::uint64_t>(source));
  }
}

std::string encode_hal_frame(const HalTelemetrySnapshot& snapshot,
                             bool replacement,
                             const std::vector<std::size_t>& changed) {
  linuxcnc::v1::HalValueFrame frame;
  frame.set_kind(frame_kind(replacement));
  frame.set_revision(snapshot.revision);
  frame.set_sequence(snapshot.sequence);
  const auto append = [&](std::size_t index) {
    auto* entry = frame.add_entries();
    entry->set_slot(snapshot.bindings.at(index).slot);
    if (snapshot.values.at(index))
      encode_hal_scalar(*snapshot.values[index], entry->mutable_value());
  };
  if (replacement) {
    for (std::size_t index = 0; index < snapshot.bindings.size(); ++index)
      append(index);
  } else {
    for (const auto index : changed) append(index);
  }
  return frame.SerializeAsString();
}

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

int hex(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

std::optional<std::string> decode_query_value(std::string_view value) {
  std::string decoded;
  decoded.reserve(value.size());
  for (std::size_t index = 0; index < value.size(); ++index) {
    if (value[index] == '+') {
      decoded.push_back(' ');
    } else if (value[index] == '%') {
      if (index + 2 >= value.size()) return std::nullopt;
      const auto high = hex(value[index + 1]);
      const auto low = hex(value[index + 2]);
      if (high < 0 || low < 0) return std::nullopt;
      decoded.push_back(static_cast<char>((high << 4) | low));
      index += 2;
    } else {
      decoded.push_back(value[index]);
    }
  }
  return decoded;
}

std::optional<std::pair<std::string, std::string>> preview_parameters(
    std::string_view target) {
  constexpr std::string_view path = "/v1/program-preview?";
  if (target.rfind(path, 0) != 0) return std::nullopt;
  std::string workspace;
  std::string relative;
  auto query = target.substr(path.size());
  while (!query.empty()) {
    const auto ampersand = query.find('&');
    const auto item = query.substr(0, ampersand);
    const auto equals = item.find('=');
    if (equals == std::string_view::npos) return std::nullopt;
    const auto name = item.substr(0, equals);
    const auto decoded = decode_query_value(item.substr(equals + 1));
    if (!decoded) return std::nullopt;
    if (name == "workspace_id") workspace = *decoded;
    if (name == "relative_path") relative = *decoded;
    if (ampersand == std::string_view::npos) break;
    query.remove_prefix(ampersand + 1);
  }
  if (workspace.empty() || relative.empty()) return std::nullopt;
  return std::pair{std::move(workspace), std::move(relative)};
}

class Session final : public std::enable_shared_from_this<Session> {
 public:
  Session(PlainStream stream, std::shared_ptr<PositionTelemetry> telemetry,
          std::shared_ptr<HalValueTelemetry> hal_telemetry,
          std::shared_ptr<ProgramWorkspaceStore> workspaces,
          BoundedExecutor& parser_worker, AdmissionCounter& preview_admission,
          std::filesystem::path ini_file, std::size_t batch_size,
          std::function<void()> release)
      : websocket_(std::move(stream)),
        position_delivery_timer_(websocket_.get_executor()),
        write_deadline_(websocket_.get_executor()),
        telemetry_(std::move(telemetry)),
        hal_telemetry_(std::move(hal_telemetry)),
        workspaces_(std::move(workspaces)),
        parser_worker_(parser_worker),
        preview_admission_(preview_admission),
        ini_file_(std::move(ini_file)),
        batch_size_(batch_size),
        release_(std::move(release)) {}

  void run() { read_upgrade(); }

  void stop() {
    {
      std::lock_guard lock(preview_flow_->mutex);
      preview_flow_->cancelled = true;
    }
    preview_flow_->condition.notify_all();
    abort_socket();
    fail();
  }

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
    } else if (const auto parameters = preview_parameters(target)) {
      mode_ = Mode::Preview;
      preview_workspace_id_ = parameters->first;
      preview_relative_path_ = parameters->second;
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
    if (mode_ == Mode::Position) {
      position_subscription_ =
          telemetry_->subscribe([weak](const std::uint64_t&) {
            if (const auto self = weak.lock()) self->queue_position_wake();
          });
      send_next(true);
    } else if (mode_ == Mode::Hal) {
      const auto callback = [weak](const std::uint64_t&) {
        if (const auto self = weak.lock()) {
          asio::post(self->websocket_.get_executor(), [weak] {
            if (const auto session = weak.lock()) session->wake_hal();
          });
        }
      };
      hal_subscription_ =
          hal_telemetry_->subscribe(hal_subscription_id_, callback);
      send_hal();
    } else {
      start_preview();
    }
    read_application_data();
  }

  void queue_position_wake() {
    if (position_wake_pending_.exchange(true)) return;
    const std::weak_ptr<Session> weak = this->shared_from_this();
    asio::post(websocket_.get_executor(), [weak] {
      if (const auto session = weak.lock())
        session->schedule_position_delivery();
    });
  }

  void schedule_position_delivery() {
    if (closed_ || closing_ || position_delivery_scheduled_) return;
    position_delivery_scheduled_ = true;
    position_delivery_timer_.expires_after(kPositionDeliveryPeriod);
    position_delivery_timer_.async_wait(beast::bind_front_handler(
        &Session::on_position_delivery, this->shared_from_this()));
  }

  void on_position_delivery(beast::error_code error) {
    position_delivery_scheduled_ = false;
    if (error == asio::error::operation_aborted || closed_ || closing_) return;
    if (error) return fail();
    if (writing_) {
      schedule_position_delivery();
      return;
    }
    position_wake_pending_ = false;
    send_next(false);
  }

  void wake_hal() {
    if (closed_) return;
    if (writing_) {
      dirty_ = true;
      return;
    }
    send_hal();
  }

  void send_next(bool initial) {
    PositionHistoryBatch batch = initial
                                     ? telemetry_->snapshot()
                                     : telemetry_->since(cursor_, generation_);
    if (!initial && !batch.reset && batch.packed.empty()) return;
    const bool replacement = initial || batch.reset;
    write_cursor_ = batch.next_sequence;
    write_generation_ = batch.generation;
    writing_ = true;
    write_frame(encode_position_frame(batch, replacement));
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
    writing_ = true;
    write_frame(encode_hal_frame(*snapshot, replacement, changed));
  }

  void write_frame(std::string frame) {
    write_frame_ = std::move(frame);
    write_deadline_.expires_after(kWriteDeadline);
    write_deadline_.async_wait([self = this->shared_from_this()](
                                   beast::error_code error) {
      if (!error) {
        self->abort_socket();
        self->fail();
      }
    });
    websocket_.async_write(
        asio::buffer(write_frame_),
        beast::bind_front_handler(&Session::on_write,
                                  this->shared_from_this()));
  }

  void on_write(beast::error_code error, std::size_t) {
    write_deadline_.cancel();
    writing_ = false;
    if (error) return fail();
    if (mode_ == Mode::Preview) {
      if (preview_active_batch_) {
        std::lock_guard lock(preview_flow_->mutex);
        --preview_flow_->outstanding_batches;
        preview_flow_->condition.notify_all();
      }
      const bool terminal = preview_active_terminal_;
      preview_active_batch_ = false;
      preview_active_terminal_ = false;
      write_frame_.clear();
      if (closing_) return close_policy_violation();
      if (terminal) return close_normal();
      pump_preview();
      return;
    }
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

  struct PreviewFlow {
    std::mutex mutex;
    std::condition_variable condition;
    std::size_t outstanding_batches = 0;
    bool cancelled = false;
  };

  struct PreviewMessage {
    std::string bytes;
    bool batch = false;
    bool terminal = false;
    bool progress = false;
  };

  void enqueue_preview(std::string bytes, bool batch, bool terminal,
                       bool progress = false) {
    const std::weak_ptr<Session> weak = this->shared_from_this();
    asio::post(
        websocket_.get_executor(),
        [weak, bytes = std::move(bytes), batch, terminal, progress]() mutable {
          const auto self = weak.lock();
          if (!self || self->closed_) return;
          if (progress && !self->preview_queue_.empty() &&
              self->preview_queue_.back().progress) {
            self->preview_queue_.back().bytes = std::move(bytes);
          } else {
            self->preview_queue_.push_back(
                {std::move(bytes), batch, terminal, progress});
          }
          self->pump_preview();
        });
  }

  void start_preview() {
    if (!preview_admission_.acquire()) return close_try_again_later();
    preview_admitted_ = true;
    const auto flow = preview_flow_;
    const auto store = workspaces_;
    const auto workspace_id = preview_workspace_id_;
    const auto relative_path = preview_relative_path_;
    const auto ini_file = ini_file_;
    const auto batch_size = batch_size_;
    const std::weak_ptr<Session> weak = this->shared_from_this();
    if (!parser_worker_.submit([flow, store, workspace_id, relative_path,
                                ini_file, batch_size, weak] {
          static_cast<void>(batch_size);
          const auto send =
              [weak](const linuxcnc::v1::ProgramPreviewEvent& event, bool batch,
                     bool terminal, bool progress = false) {
                if (const auto self = weak.lock())
                  self->enqueue_preview(event.SerializeAsString(), batch,
                                        terminal, progress);
              };
#ifdef LINUXCNC_GRPC_HAS_RS274
          std::filesystem::path source;
          const bool leased =
              store->pin_entry(workspace_id, relative_path, &source);
          if (!leased) {
            linuxcnc::v1::ProgramPreviewEvent event;
            auto* error = event.mutable_error();
            error->set_code(
                linuxcnc::v1::PROGRAM_PREVIEW_ERROR_CODE_INVALID_ENTRY);
            error->set_message("program workspace entry is missing or unsafe");
            send(std::move(event), false, true);
            return;
          }
          struct Lease {
            std::shared_ptr<ProgramWorkspaceStore> store;
            std::string workspace;
            ~Lease() { store->unpin_entry(workspace); }
          } lease{store, workspace_id};
          try {
            gcode::ParseOptions options;
            options.ini_path = ini_file.string();
            options.program_prefix = (store->root() / workspace_id).string();
            options.batch_size = batch_size;
            options.is_cancelled = [flow] {
              std::lock_guard lock(flow->mutex);
              return flow->cancelled;
            };
            options.on_progress = [send](const gcode::ParseProgress& progress) {
              linuxcnc::v1::ProgramPreviewEvent event;
              auto* encoded = event.mutable_progress();
              encoded->set_bytes_read(progress.bytesRead);
              encoded->set_total_bytes(progress.totalBytes);
              encoded->set_percent(static_cast<std::uint32_t>(
                  std::clamp(progress.percent, 0.0, 100.0)));
              encoded->set_operation_count(progress.operationCount);
              send(std::move(event), false, false, true);
            };
            options.on_batch = [flow, send](gcode::OperationBatch&& batch) {
              if (batch.empty()) return true;
              const auto send_batch =
                  [flow, send](linuxcnc::v1::ProgramPreviewEvent&& event) {
                    std::unique_lock lock(flow->mutex);
                    flow->condition.wait(lock, [flow] {
                      return flow->cancelled || flow->outstanding_batches < 2;
                    });
                    if (flow->cancelled) return false;
                    ++flow->outstanding_batches;
                    lock.unlock();
                    send(std::move(event), true, false);
                    return true;
                  };
              constexpr std::size_t max_preview_frame_bytes =
                  4U * 1024U * 1024U;
              linuxcnc::v1::ProgramPreviewEvent event;
              for (const auto& operation : batch) {
                encode_gcode_operation(operation,
                                       event.mutable_batch()->add_operations());
                if (event.ByteSizeLong() <= max_preview_frame_bytes) continue;
                event.mutable_batch()->mutable_operations()->RemoveLast();
                if (event.batch().operations().empty())
                  throw std::runtime_error(
                      "G-code operation exceeds preview frame byte limit");
                if (!send_batch(std::move(event))) return false;
                event.Clear();
                encode_gcode_operation(operation,
                                       event.mutable_batch()->add_operations());
                if (event.ByteSizeLong() > max_preview_frame_bytes)
                  throw std::runtime_error(
                      "G-code operation exceeds preview frame byte limit");
              }
              return event.batch().operations().empty() ||
                     send_batch(std::move(event));
            };
            const auto result = gcode::parse_file(source.string(), options);
            {
              std::lock_guard lock(flow->mutex);
              if (flow->cancelled || result.cancelled) return;
            }
            linuxcnc::v1::ProgramPreviewEvent event;
            auto* summary = event.mutable_summary();
            encode_gcode_extents(result.extents, summary->mutable_extents());
            summary->set_operation_count(result.operationCount);
            send(std::move(event), false, true);
          } catch (const gcode::ParseError& exception) {
            linuxcnc::v1::ProgramPreviewEvent event;
            auto* error = event.mutable_error();
            switch (exception.code()) {
              case gcode::ParseErrorCode::InvalidEntry:
                error->set_code(
                    linuxcnc::v1::PROGRAM_PREVIEW_ERROR_CODE_INVALID_ENTRY);
                break;
              case gcode::ParseErrorCode::Interpreter:
                error->set_code(
                    linuxcnc::v1::PROGRAM_PREVIEW_ERROR_CODE_INTERPRETER);
                break;
              case gcode::ParseErrorCode::Internal:
                error->set_code(
                    linuxcnc::v1::PROGRAM_PREVIEW_ERROR_CODE_INTERNAL);
                break;
            }
            error->set_message(exception.what());
            if (exception.line_number())
              error->set_line_number(*exception.line_number());
            send(std::move(event), false, true);
          } catch (const std::exception& exception) {
            linuxcnc::v1::ProgramPreviewEvent event;
            auto* error = event.mutable_error();
            error->set_code(linuxcnc::v1::PROGRAM_PREVIEW_ERROR_CODE_INTERNAL);
            error->set_message(exception.what());
            send(std::move(event), false, true);
          }
#else
          if (const auto self = weak.lock()) {
            asio::post(self->websocket_.get_executor(), [weak] {
              if (const auto session = weak.lock())
                session->close_try_again_later();
            });
          }
#endif
        })) {
      close_try_again_later();
    }
  }

  void pump_preview() {
    if (writing_ || preview_queue_.empty() || closed_) return;
    auto message = std::move(preview_queue_.front());
    preview_queue_.pop_front();
    preview_active_batch_ = message.batch;
    preview_active_terminal_ = message.terminal;
    writing_ = true;
    write_frame(std::move(message.bytes));
  }

  void close_normal() {
    websocket_.async_close(
        websocket::close_code::normal,
        [self = this->shared_from_this()](beast::error_code) { self->fail(); });
  }

  void close_try_again_later() {
    websocket::close_reason reason(websocket::close_code::try_again_later);
    reason.reason = "preview capacity unavailable";
    websocket_.async_close(reason, [self = this->shared_from_this()](
                                       beast::error_code) { self->fail(); });
  }

  void fail() {
    if (closed_) return;
    closed_ = true;
    {
      std::lock_guard lock(preview_flow_->mutex);
      preview_flow_->cancelled = true;
    }
    preview_flow_->condition.notify_all();
    position_delivery_timer_.cancel();
    write_deadline_.cancel();
    position_subscription_.reset();
    hal_subscription_.reset();
    if (!hal_subscription_id_.empty()) {
      hal_telemetry_->erase(hal_subscription_id_);
      hal_subscription_id_.clear();
    }
    if (preview_admitted_) {
      preview_admitted_ = false;
      preview_admission_.release();
    }
    if (release_) {
      release_();
      release_ = {};
    }
    write_frame_.clear();
    preview_queue_.clear();
    abort_socket();
  }

  void abort_socket() {
    beast::error_code ignored;
    // NOLINTNEXTLINE(bugprone-unused-return-value): best-effort teardown
    (void)beast::get_lowest_layer(websocket_)
        .socket()
        .shutdown(tcp::socket::shutdown_both, ignored);
    // NOLINTNEXTLINE(bugprone-unused-return-value): best-effort teardown
    (void)beast::get_lowest_layer(websocket_).socket().close(ignored);
  }

  websocket::stream<PlainStream> websocket_;
  asio::steady_timer position_delivery_timer_;
  asio::steady_timer write_deadline_;
  std::shared_ptr<PositionTelemetry> telemetry_;
  std::shared_ptr<HalValueTelemetry> hal_telemetry_;
  std::shared_ptr<ProgramWorkspaceStore> workspaces_;
  BoundedExecutor& parser_worker_;
  AdmissionCounter& preview_admission_;
  const std::filesystem::path ini_file_;
  const std::size_t batch_size_;
  PositionTelemetry::Subscription position_subscription_;
  HalValueTelemetry::Subscription hal_subscription_;
  std::function<void()> release_;
  beast::flat_buffer read_buffer_;
  http::request<http::string_body> request_;
  std::string write_frame_;
  std::optional<HalTelemetrySnapshot> write_hal_snapshot_;
  std::vector<std::optional<HalTelemetryValue>> hal_values_;
  std::string hal_subscription_id_;
  std::string preview_workspace_id_;
  std::string preview_relative_path_;
  std::shared_ptr<PreviewFlow> preview_flow_ = std::make_shared<PreviewFlow>();
  std::deque<PreviewMessage> preview_queue_;
  std::uint64_t hal_revision_ = 0;
  std::uint64_t cursor_ = 0;
  std::uint64_t generation_ = 0;
  std::uint64_t write_cursor_ = 0;
  std::uint64_t write_generation_ = 0;
  std::atomic<bool> position_wake_pending_{false};
  bool writing_ = false;
  bool dirty_ = false;
  bool position_delivery_scheduled_ = false;
  bool closing_ = false;
  bool closed_ = false;
  bool preview_active_batch_ = false;
  bool preview_active_terminal_ = false;
  bool preview_admitted_ = false;
  enum class Mode { Position, Hal, Preview } mode_ = Mode::Position;
};

}  // namespace

class TelemetryWebSocketServer::Impl {
 public:
  Impl(const DaemonConfig& config, std::shared_ptr<PositionTelemetry> telemetry,
       std::shared_ptr<HalValueTelemetry> hal_telemetry,
       std::shared_ptr<ProgramWorkspaceStore> workspaces,
       BoundedExecutor& parser_worker, AdmissionCounter& preview_admission)
      : telemetry_(std::move(telemetry)),
        hal_telemetry_(std::move(hal_telemetry)),
        workspaces_(std::move(workspaces)),
        parser_worker_(parser_worker),
        preview_admission_(preview_admission),
        ini_file_(config.ini_file),
        batch_size_(config.gcode_batch_size),
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
      // NOLINTNEXTLINE(bugprone-unused-return-value): best-effort teardown
      (void)acceptor_.cancel(ignored);
      // NOLINTNEXTLINE(bugprone-unused-return-value): best-effort teardown
      (void)acceptor_.close(ignored);
      for (auto& weak : sessions_) {
        if (const auto session = weak.lock()) session->stop();
      }
      sessions_.clear();
    });
    if (thread_.joinable()) thread_.join();
  }

 private:
  void accept() {
    acceptor_.async_accept([this](beast::error_code error, tcp::socket socket) {
      if (!error) {
        sessions_.erase(
            std::remove_if(sessions_.begin(), sessions_.end(),
                           [](const auto& weak) { return weak.expired(); }),
            sessions_.end());
        if (active_sessions_.fetch_add(1) >= kMaxSessions) {
          active_sessions_.fetch_sub(1);
          beast::error_code ignored;
          // NOLINTNEXTLINE(bugprone-unused-return-value): rejected connection
          (void)socket.close(ignored);
        } else {
          auto release = [this] { active_sessions_.fetch_sub(1); };
          auto session = std::make_shared<Session>(
              PlainStream(std::move(socket)), telemetry_, hal_telemetry_,
              workspaces_, parser_worker_, preview_admission_, ini_file_,
              batch_size_, std::move(release));
          sessions_.push_back(session);
          session->run();
        }
      }
      if (!stopped_) accept();
    });
  }

  asio::io_context io_{1};
  std::shared_ptr<PositionTelemetry> telemetry_;
  std::shared_ptr<HalValueTelemetry> hal_telemetry_;
  std::shared_ptr<ProgramWorkspaceStore> workspaces_;
  BoundedExecutor& parser_worker_;
  AdmissionCounter& preview_admission_;
  const std::filesystem::path ini_file_;
  const std::size_t batch_size_;
  tcp::acceptor acceptor_;
  std::atomic<bool> stopped_{false};
  std::atomic<std::size_t> active_sessions_{0};
  std::vector<std::weak_ptr<Session>> sessions_;
  std::thread thread_;
};

TelemetryWebSocketServer::TelemetryWebSocketServer(
    const DaemonConfig& config, std::shared_ptr<PositionTelemetry> telemetry,
    std::shared_ptr<HalValueTelemetry> hal_telemetry,
    std::shared_ptr<ProgramWorkspaceStore> workspaces,
    BoundedExecutor& parser_worker, AdmissionCounter& preview_admission)
    : impl_(std::make_unique<Impl>(
          config, std::move(telemetry), std::move(hal_telemetry),
          std::move(workspaces), parser_worker, preview_admission)) {}

TelemetryWebSocketServer::~TelemetryWebSocketServer() = default;

void TelemetryWebSocketServer::stop() { impl_->stop(); }

}  // namespace linuxcnc::server
