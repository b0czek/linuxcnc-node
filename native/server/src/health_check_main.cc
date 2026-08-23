#include "grpc/health/v1/health.grpc.pb.h"

#include <grpcpp/grpcpp.h>

#include <chrono>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  const std::string endpoint = argc > 1 ? argv[1] : "127.0.0.1:50051";
  const auto channel = grpc::CreateChannel(
      endpoint, grpc::InsecureChannelCredentials());
  if (!channel->WaitForConnected(
          std::chrono::system_clock::now() + std::chrono::seconds(2))) {
    std::cerr << "linuxcnc-grpc-health-check: cannot connect to " << endpoint
              << '\n';
    return 1;
  }

  auto health = grpc::health::v1::Health::NewStub(channel);
  grpc::health::v1::HealthCheckRequest request;
  request.set_service("");
  grpc::health::v1::HealthCheckResponse response;
  grpc::ClientContext context;
  context.set_deadline(
      std::chrono::system_clock::now() + std::chrono::seconds(2));
  const auto status = health->Check(&context, request, &response);
  if (!status.ok() ||
      response.status() != grpc::health::v1::HealthCheckResponse::SERVING) {
    std::cerr << "linuxcnc-grpc-health-check: server is not serving on "
              << endpoint << '\n';
    return 1;
  }
  return 0;
}
