#pragma once

namespace grpc {
class Service;
}  // namespace grpc

namespace linuxcnc::server::detail {

// Common ownership and lifecycle seam for callback-based gRPC services. The
// concrete generated callback bases stay private to their implementation
// translation units; the server runner only needs this small boundary.
class ManagedGrpcService {
 public:
  virtual ~ManagedGrpcService() = default;

  ManagedGrpcService(const ManagedGrpcService&) = delete;
  ManagedGrpcService& operator=(const ManagedGrpcService&) = delete;

  virtual ::grpc::Service* service() noexcept = 0;
  virtual void shutdown() = 0;

 protected:
  ManagedGrpcService() = default;
};

}  // namespace linuxcnc::server::detail
