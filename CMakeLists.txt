cmake_minimum_required(VERSION 3.16)

project(linuxcnc_node_native LANGUAGES CXX)

include(CTest)

option(LINUXCNC_GRPC_BUILD_SERVER "Build the native LinuxCNC gRPC server target" ON)
if(LINUXCNC_GRPC_BUILD_SERVER)
  add_subdirectory(native/server)
endif()
