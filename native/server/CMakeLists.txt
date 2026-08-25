cmake_minimum_required(VERSION 3.16)

project(linuxcnc_grpc_server LANGUAGES CXX)

include(GNUInstallDirs)
include(CTest)

option(LINUXCNC_GRPC_BUILD_TESTS "Build transport-neutral native server tests" ${BUILD_TESTING})
option(LINUXCNC_GRPC_ENABLE_EXTERNAL_DEPS "Discover optional LinuxCNC, protobuf, and gRPC dependencies" ON)
option(LINUXCNC_GRPC_BUILD_WIRE "Generate and build linuxcnc.v1 protobuf/gRPC C++ sources" ON)
option(LINUXCNC_GRPC_ENABLE_NML "Build the LinuxCNC NML adapter when a checkout is available" ON)

find_package(Threads REQUIRED)

get_filename_component(LINUXCNC_GRPC_REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(LINUXCNC_ROOT "${LINUXCNC_GRPC_REPO_ROOT}/linuxcnc" CACHE PATH
    "Pinned LinuxCNC checkout used by the standalone daemon")

set(LINUXCNC_GRPC_DOMAIN_SOURCES
    src/callback_runtime.cc
    src/command_coordinator.cc
    src/daemon_config.cc
    src/hal_repository.cc
    src/hal_value_telemetry.cc
    src/position_history.cc
    src/position_telemetry.cc
    src/program_workspace.cc
    src/scope_manager.cc
    src/status_hub.cc
    src/nml_adapter.cc
)

add_library(linuxcnc-grpc-domain STATIC ${LINUXCNC_GRPC_DOMAIN_SOURCES})
target_compile_features(linuxcnc-grpc-domain PUBLIC cxx_std_17)
target_include_directories(linuxcnc-grpc-domain
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
)
target_link_libraries(linuxcnc-grpc-domain PUBLIC Threads::Threads)
target_compile_options(linuxcnc-grpc-domain PRIVATE -Wall -Wextra -Wpedantic)

# The domain library intentionally has no protobuf, gRPC,
# dependency.  The transport target can link the generated protobuf sources
# when they are available without changing this boundary.  These discoveries
# are informational today and make the target ready for the generated RPC
# implementation.
if(LINUXCNC_GRPC_ENABLE_EXTERNAL_DEPS)
    find_package(Protobuf QUIET)
    find_package(gRPC QUIET)
endif()

if(LINUXCNC_GRPC_ENABLE_NML)
    if(EXISTS "${LINUXCNC_ROOT}/src/emc/nml_intf/emc_nml.hh" AND
       EXISTS "${LINUXCNC_ROOT}/src/emc/nml_intf/emc.cc")
        find_library(LINUXCNC_NML_LIBRARY NAMES nml PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
        find_library(LINUXCNC_INI_LIBRARY NAMES linuxcncini PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
        find_library(LINUXCNC_TOOLDATA_LIBRARY NAMES tooldata PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
        if(LINUXCNC_NML_LIBRARY AND LINUXCNC_INI_LIBRARY AND LINUXCNC_TOOLDATA_LIBRARY)
            target_compile_definitions(linuxcnc-grpc-domain PUBLIC LINUXCNC_GRPC_HAS_NML=1)
            set(LINUXCNC_GRPC_HAS_NML TRUE)
            target_include_directories(linuxcnc-grpc-domain PRIVATE
                "${LINUXCNC_ROOT}/src"
                "${LINUXCNC_ROOT}/src/emc"
                "${LINUXCNC_ROOT}/src/emc/nml_intf"
                "${LINUXCNC_ROOT}/src/emc/rs274ngc"
                "${LINUXCNC_ROOT}/src/emc/ini"
                "${LINUXCNC_ROOT}/src/emc/kinematics"
                "${LINUXCNC_ROOT}/src/libnml/buffer"
                "${LINUXCNC_ROOT}/src/libnml/cms"
                "${LINUXCNC_ROOT}/src/libnml/nml"
                "${LINUXCNC_ROOT}/src/libnml/rcs"
                "${LINUXCNC_ROOT}/src/libnml/os_intf"
                "${LINUXCNC_ROOT}/src/rtapi"
                "${LINUXCNC_ROOT}/include")
            target_sources(linuxcnc-grpc-domain PRIVATE
                src/linuxcnc_emc_globals.cc
                src/linuxcnc_emc_format.cc
                src/linuxcnc_emc_ops.cc
                src/linuxcnc_modal_state.cc)
            target_link_libraries(linuxcnc-grpc-domain PUBLIC
                "${LINUXCNC_NML_LIBRARY}"
                "${LINUXCNC_INI_LIBRARY}"
                "${LINUXCNC_TOOLDATA_LIBRARY}")
            message(STATUS "LinuxCNC NML adapter enabled from ${LINUXCNC_ROOT}")
        else()
            message(STATUS "LinuxCNC libraries not found; building contract-only native server")
        endif()
    else()
        message(STATUS "LinuxCNC checkout not found; building contract-only native server")
    endif()
endif()

# The rs274 interpreter and HAL repository are native LinuxCNC boundaries,
# built only when the pinned checkout and its development libraries exist.
# Their public domain headers remain independent of protobuf, gRPC, and Node.
if(LINUXCNC_GRPC_ENABLE_NML AND
   EXISTS "${LINUXCNC_ROOT}/src/emc/rs274ngc/interp_base.hh")
    find_library(LINUXCNC_RS274_LIBRARY NAMES rs274 PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
    find_library(LINUXCNC_PARSER_INI_LIBRARY NAMES linuxcncini PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
    find_library(LINUXCNC_PARSER_TOOLDATA_LIBRARY NAMES tooldata PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
    find_package(Python3 QUIET COMPONENTS Development)
    if(LINUXCNC_RS274_LIBRARY AND LINUXCNC_PARSER_INI_LIBRARY AND
       LINUXCNC_PARSER_TOOLDATA_LIBRARY AND Python3_Development_FOUND)
        target_sources(linuxcnc-grpc-domain PRIVATE
            src/gcode_parser.cc
            src/gcode_canon_preview.cc
            src/gcode_python_modules.cc
            "${LINUXCNC_ROOT}/src/emc/rs274ngc/recordingcanon.cc")
        target_compile_definitions(linuxcnc-grpc-domain PUBLIC LINUXCNC_GRPC_HAS_RS274=1)
        set(LINUXCNC_GRPC_HAS_RS274 TRUE)
        target_compile_definitions(linuxcnc-grpc-domain PRIVATE ULAPI)
        target_include_directories(linuxcnc-grpc-domain PRIVATE
            "${LINUXCNC_ROOT}/include"
            "${LINUXCNC_ROOT}/src"
            "${LINUXCNC_ROOT}/src/emc"
            "${LINUXCNC_ROOT}/src/emc/ini"
            "${LINUXCNC_ROOT}/src/emc/rs274ngc"
            "${LINUXCNC_ROOT}/src/emc/nml_intf"
            "${LINUXCNC_ROOT}/src/emc/tooldata"
            "${LINUXCNC_ROOT}/src/emc/motion"
            "${LINUXCNC_ROOT}/src/libnml/buffer"
            "${LINUXCNC_ROOT}/src/libnml/cms"
            "${LINUXCNC_ROOT}/src/libnml/linklist"
            "${LINUXCNC_ROOT}/src/libnml/nml"
            "${LINUXCNC_ROOT}/src/libnml/os_intf"
            "${LINUXCNC_ROOT}/src/libnml/posemath"
            "${LINUXCNC_ROOT}/src/libnml/rcs"
            "${LINUXCNC_ROOT}/src/rtapi")
        target_link_libraries(linuxcnc-grpc-domain PUBLIC
            "${LINUXCNC_RS274_LIBRARY}"
            "${LINUXCNC_PARSER_INI_LIBRARY}"
            "${LINUXCNC_PARSER_TOOLDATA_LIBRARY}"
            Python3::Python
            "${CMAKE_DL_LIBS}")
        message(STATUS "LinuxCNC rs274 parser enabled from ${LINUXCNC_ROOT}")
    else()
        message(STATUS "LinuxCNC rs274 dependencies not found; program preview will be unavailable")
    endif()
endif()

if(LINUXCNC_GRPC_ENABLE_NML AND EXISTS "${LINUXCNC_ROOT}/src/hal/hal_priv.h")
    find_library(LINUXCNC_HAL_LIBRARY NAMES linuxcnchal PATHS "${LINUXCNC_ROOT}/lib" NO_DEFAULT_PATH)
    if(LINUXCNC_HAL_LIBRARY)
        target_sources(linuxcnc-grpc-domain PRIVATE
            src/hal_adapter.cc
            src/scope_controller.cc)
        target_compile_definitions(linuxcnc-grpc-domain PUBLIC LINUXCNC_GRPC_HAS_HAL=1)
        target_compile_definitions(linuxcnc-grpc-domain PUBLIC LINUXCNC_GRPC_HAS_SCOPE=1)
        set(LINUXCNC_GRPC_HAS_HAL TRUE)
        set(LINUXCNC_GRPC_HAS_SCOPE TRUE)
        target_compile_definitions(linuxcnc-grpc-domain PRIVATE ULAPI)
        target_include_directories(linuxcnc-grpc-domain PRIVATE
            "${LINUXCNC_ROOT}/include"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
            "${LINUXCNC_ROOT}/src"
            "${LINUXCNC_ROOT}/src/hal"
            "${LINUXCNC_ROOT}/src/rtapi")
        target_link_libraries(linuxcnc-grpc-domain PUBLIC "${LINUXCNC_HAL_LIBRARY}")
        message(STATUS "LinuxCNC HAL adapter enabled from ${LINUXCNC_ROOT}")
    else()
        message(STATUS "LinuxCNC HAL library not found; building contract HAL repository")
    endif()
endif()

if(EXISTS "${LINUXCNC_ROOT}/lib")
    set_target_properties(linuxcnc-grpc-domain PROPERTIES
        BUILD_RPATH "${LINUXCNC_ROOT}/lib")
endif()

add_executable(linuxcnc-grpc-server src/daemon_main.cc)
target_compile_features(linuxcnc-grpc-server PRIVATE cxx_std_17)
target_link_libraries(linuxcnc-grpc-server PRIVATE linuxcnc-grpc-domain Threads::Threads)
target_compile_options(linuxcnc-grpc-server PRIVATE -Wall -Wextra -Wpedantic)

# Generated files live only in the build tree and are never hand-edited or
# checked in. Pass LINUXCNC_GRPC_BUILD_WIRE=OFF for a domain-only build.
if(LINUXCNC_GRPC_BUILD_WIRE)
    find_package(Boost REQUIRED)
    find_package(Protobuf REQUIRED)
    find_package(gRPC REQUIRED)
    find_program(LINUXCNC_GRPC_PROTOC protoc REQUIRED)
    find_program(LINUXCNC_GRPC_CPP_PLUGIN grpc_cpp_plugin REQUIRED)
    find_path(LINUXCNC_GRPC_PROTOBUF_INCLUDE google/protobuf/empty.proto
        HINTS /usr/include /usr/local/include "${CMAKE_PREFIX_PATH}/include")
    if(NOT LINUXCNC_GRPC_PROTOBUF_INCLUDE)
        message(FATAL_ERROR "protobuf imports are required for LINUXCNC_GRPC_BUILD_WIRE")
    endif()
    set(LINUXCNC_GRPC_PROTO_ROOT "${LINUXCNC_GRPC_REPO_ROOT}/proto" CACHE PATH
        "Root containing versioned LinuxCNC protobuf files")
    set(LINUXCNC_GRPC_PROTO_FILES
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/common.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/machine.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/program.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/hal.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/scope.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/websocket.proto"
        "${LINUXCNC_GRPC_PROTO_ROOT}/linuxcnc/v1/linuxcnc.proto")
    set(LINUXCNC_GRPC_HEALTH_PROTO_FILE "${LINUXCNC_GRPC_PROTO_ROOT}/grpc/health/v1/health.proto")
    set(LINUXCNC_GRPC_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
    set(LINUXCNC_GRPC_GENERATED_CC
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/common.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/common.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/machine.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/machine.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/program.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/program.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/hal.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/hal.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/scope.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/scope.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/websocket.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/websocket.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/linuxcnc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/linuxcnc.grpc.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/grpc/health/v1/health.pb.cc"
        "${LINUXCNC_GRPC_GENERATED_DIR}/grpc/health/v1/health.grpc.pb.cc")
    set(LINUXCNC_GRPC_GENERATED_HEADERS
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/common.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/common.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/machine.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/machine.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/program.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/program.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/hal.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/hal.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/scope.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/scope.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/websocket.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/websocket.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/linuxcnc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/linuxcnc/v1/linuxcnc.grpc.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/grpc/health/v1/health.pb.h"
        "${LINUXCNC_GRPC_GENERATED_DIR}/grpc/health/v1/health.grpc.pb.h")
    add_custom_command(
        OUTPUT ${LINUXCNC_GRPC_GENERATED_CC} ${LINUXCNC_GRPC_GENERATED_HEADERS}
        COMMAND ${CMAKE_COMMAND} -E make_directory "${LINUXCNC_GRPC_GENERATED_DIR}"
        COMMAND "${LINUXCNC_GRPC_PROTOC}"
            --proto_path=${LINUXCNC_GRPC_PROTO_ROOT}
            --proto_path=${LINUXCNC_GRPC_PROTOBUF_INCLUDE}
            --cpp_out=${LINUXCNC_GRPC_GENERATED_DIR}
            --grpc_out=${LINUXCNC_GRPC_GENERATED_DIR}
            --plugin=protoc-gen-grpc=${LINUXCNC_GRPC_CPP_PLUGIN}
            ${LINUXCNC_GRPC_PROTO_FILES}
            "${LINUXCNC_GRPC_HEALTH_PROTO_FILE}"
        DEPENDS ${LINUXCNC_GRPC_PROTO_FILES} "${LINUXCNC_GRPC_HEALTH_PROTO_FILE}"
        VERBATIM)
    add_library(linuxcnc-grpc-proto STATIC ${LINUXCNC_GRPC_GENERATED_CC})
    target_include_directories(linuxcnc-grpc-proto PUBLIC "${LINUXCNC_GRPC_GENERATED_DIR}")
    target_link_libraries(linuxcnc-grpc-proto PUBLIC protobuf::libprotobuf gRPC::grpc++)
    if(TARGET gRPC::grpc++_reflection)
        target_link_libraries(linuxcnc-grpc-proto PUBLIC gRPC::grpc++_reflection)
    endif()
    add_library(linuxcnc-grpc-wire STATIC
        src/protobuf_gcode_mapping.cc
        src/grpc_hal_mapping.cc)
    target_link_libraries(linuxcnc-grpc-wire PUBLIC
        linuxcnc-grpc-domain linuxcnc-grpc-proto)
    set(LINUXCNC_GRPC_SERVER_SOURCES
        src/grpc_server.cc
        src/grpc/server_runtime.cc
        src/grpc/machine_service.cc
        src/grpc/machine_status_codec.cc
        src/grpc/program_service.cc
        src/grpc/hal_service.cc
        src/grpc/scope_service.cc)
    if(LINUXCNC_GRPC_HAS_HAL)
        list(APPEND LINUXCNC_GRPC_SERVER_SOURCES src/grpc/hal_service_hal.cc)
    else()
        list(APPEND LINUXCNC_GRPC_SERVER_SOURCES src/grpc/hal_service_repository.cc)
    endif()
    if(LINUXCNC_GRPC_HAS_SCOPE)
        list(APPEND LINUXCNC_GRPC_SERVER_SOURCES src/grpc/scope_service_controller.cc)
    else()
        list(APPEND LINUXCNC_GRPC_SERVER_SOURCES src/grpc/scope_service_manager.cc)
    endif()
    target_sources(linuxcnc-grpc-server PRIVATE ${LINUXCNC_GRPC_SERVER_SOURCES})
    target_sources(linuxcnc-grpc-server PRIVATE src/telemetry_websocket_server.cc)
    target_compile_definitions(linuxcnc-grpc-server PRIVATE LINUXCNC_GRPC_BUILD_WIRE=1)
    target_compile_definitions(linuxcnc-grpc-server PRIVATE BOOST_ERROR_CODE_HEADER_ONLY=1)
    target_include_directories(linuxcnc-grpc-server PRIVATE ${Boost_INCLUDE_DIRS})
    target_include_directories(linuxcnc-grpc-server PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src")
    target_link_libraries(linuxcnc-grpc-server PRIVATE linuxcnc-grpc-wire)
    add_executable(linuxcnc-grpc-health-check src/health_check_main.cc)
    target_compile_features(linuxcnc-grpc-health-check PRIVATE cxx_std_17)
    target_link_libraries(linuxcnc-grpc-health-check PRIVATE linuxcnc-grpc-proto)
    target_compile_options(linuxcnc-grpc-health-check PRIVATE -Wall -Wextra -Wpedantic)
    add_executable(linuxcnc-grpc-integration tests/grpc_integration.cc)
    target_compile_features(linuxcnc-grpc-integration PRIVATE cxx_std_17)
    target_compile_definitions(linuxcnc-grpc-integration PRIVATE BOOST_ERROR_CODE_HEADER_ONLY=1)
    target_include_directories(linuxcnc-grpc-integration PRIVATE ${Boost_INCLUDE_DIRS})
    target_link_libraries(linuxcnc-grpc-integration PRIVATE linuxcnc-grpc-proto)
    if(LINUXCNC_GRPC_HAS_NML AND LINUXCNC_GRPC_HAS_HAL)
        add_executable(linuxcnc-grpc-live-integration tests/grpc_live_integration.cc)
        target_compile_features(linuxcnc-grpc-live-integration PRIVATE cxx_std_17)
        target_compile_definitions(linuxcnc-grpc-live-integration PRIVATE BOOST_ERROR_CODE_HEADER_ONLY=1)
        target_include_directories(linuxcnc-grpc-live-integration PRIVATE ${Boost_INCLUDE_DIRS})
        target_link_libraries(linuxcnc-grpc-live-integration PRIVATE linuxcnc-grpc-proto)
        target_compile_options(linuxcnc-grpc-live-integration PRIVATE
            -Wall -Wextra -Wpedantic)
    endif()
    if(LINUXCNC_GRPC_BUILD_TESTS)
        if(NOT LINUXCNC_GRPC_HAS_HAL)
            add_test(NAME linuxcnc-grpc-integration
                COMMAND bash "${CMAKE_CURRENT_SOURCE_DIR}/tests/run_grpc_integration.sh"
                        "$<TARGET_FILE:linuxcnc-grpc-server>"
                        "$<TARGET_FILE:linuxcnc-grpc-integration>")
        endif()
        if(LINUXCNC_GRPC_HAS_NML AND LINUXCNC_GRPC_HAS_HAL)
            add_test(NAME linuxcnc-grpc-live-integration
                COMMAND bash "${CMAKE_CURRENT_SOURCE_DIR}/tests/run_grpc_live_integration.sh"
                        "$<TARGET_FILE:linuxcnc-grpc-server>"
                        "$<TARGET_FILE:linuxcnc-grpc-live-integration>"
                        "${LINUXCNC_ROOT}")
            set_tests_properties(linuxcnc-grpc-live-integration PROPERTIES
                SKIP_RETURN_CODE 77
                TIMEOUT 120)
        endif()
        add_executable(linuxcnc-protobuf-gcode-mapping-tests tests/protobuf_gcode_mapping_tests.cc)
        target_compile_features(linuxcnc-protobuf-gcode-mapping-tests PRIVATE cxx_std_17)
        target_link_libraries(linuxcnc-protobuf-gcode-mapping-tests PRIVATE linuxcnc-grpc-wire)
        add_test(NAME linuxcnc-protobuf-gcode-mapping-tests
                 COMMAND linuxcnc-protobuf-gcode-mapping-tests)
        add_executable(linuxcnc-grpc-mapping-edge-tests
            tests/grpc_mapping_edge_tests.cc)
        target_compile_features(linuxcnc-grpc-mapping-edge-tests PRIVATE cxx_std_17)
        target_link_libraries(linuxcnc-grpc-mapping-edge-tests PRIVATE linuxcnc-grpc-wire)
        target_compile_options(linuxcnc-grpc-mapping-edge-tests PRIVATE
            -Wall -Wextra -Wpedantic)
        add_test(NAME linuxcnc-grpc-mapping-edge-tests
                 COMMAND linuxcnc-grpc-mapping-edge-tests)
    endif()
endif()

install(TARGETS linuxcnc-grpc-server linuxcnc-grpc-domain
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR})

if(TARGET linuxcnc-grpc-health-check)
    install(TARGETS linuxcnc-grpc-health-check
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
endif()
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

if(LINUXCNC_GRPC_BUILD_TESTS)
    enable_testing()
    add_executable(linuxcnc-grpc-domain-tests tests/domain_tests.cc)
    target_compile_features(linuxcnc-grpc-domain-tests PRIVATE cxx_std_17)
    target_link_libraries(linuxcnc-grpc-domain-tests PRIVATE linuxcnc-grpc-domain Threads::Threads)
    target_compile_options(linuxcnc-grpc-domain-tests PRIVATE -Wall -Wextra -Wpedantic)
    add_test(NAME linuxcnc-grpc-domain-tests COMMAND linuxcnc-grpc-domain-tests)
    add_executable(linuxcnc-grpc-native-edge-tests tests/native_edge_tests.cc)
    target_compile_features(linuxcnc-grpc-native-edge-tests PRIVATE cxx_std_17)
    target_link_libraries(linuxcnc-grpc-native-edge-tests PRIVATE
        linuxcnc-grpc-domain Threads::Threads)
    target_compile_options(linuxcnc-grpc-native-edge-tests PRIVATE
        -Wall -Wextra -Wpedantic)
    add_test(NAME linuxcnc-grpc-native-edge-tests
             COMMAND linuxcnc-grpc-native-edge-tests)
    set(LINUXCNC_GRPC_CALLBACK_SOURCES
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc_server.cc"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/server_runtime.cc"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/server_runtime.hpp"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/machine_service.cc"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/program_service.cc"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/hal_service.cc"
        "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/scope_service.cc")
    if(LINUXCNC_GRPC_HAS_HAL)
        list(APPEND LINUXCNC_GRPC_CALLBACK_SOURCES
            "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/hal_service_hal.cc")
    else()
        list(APPEND LINUXCNC_GRPC_CALLBACK_SOURCES
            "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/hal_service_repository.cc")
    endif()
    if(LINUXCNC_GRPC_HAS_SCOPE)
        list(APPEND LINUXCNC_GRPC_CALLBACK_SOURCES
            "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/scope_service_controller.cc")
    else()
        list(APPEND LINUXCNC_GRPC_CALLBACK_SOURCES
            "${CMAKE_CURRENT_SOURCE_DIR}/src/grpc/scope_service_manager.cc")
    endif()
    add_test(NAME linuxcnc-grpc-callback-source-assertion
        COMMAND bash "${CMAKE_CURRENT_SOURCE_DIR}/tests/assert_callback_server.sh"
                ${LINUXCNC_GRPC_CALLBACK_SOURCES})
    add_executable(linuxcnc-grpc-hal-adapter-contract-tests
        tests/hal_adapter_contract_tests.cc)
    target_compile_features(linuxcnc-grpc-hal-adapter-contract-tests PRIVATE cxx_std_17)
    target_link_libraries(linuxcnc-grpc-hal-adapter-contract-tests PRIVATE linuxcnc-grpc-domain)
    target_compile_options(linuxcnc-grpc-hal-adapter-contract-tests PRIVATE
        -Wall -Wextra -Wpedantic)
    add_test(NAME linuxcnc-grpc-hal-adapter-contract-tests
             COMMAND linuxcnc-grpc-hal-adapter-contract-tests)

    if(LINUXCNC_GRPC_HAS_RS274)
        add_executable(linuxcnc-grpc-gcode-parser-integration tests/gcode_parser_integration.cc)
        target_compile_features(linuxcnc-grpc-gcode-parser-integration PRIVATE cxx_std_17)
        target_link_libraries(linuxcnc-grpc-gcode-parser-integration PRIVATE linuxcnc-grpc-domain)
        add_test(NAME linuxcnc-grpc-gcode-parser-integration
            COMMAND bash "${CMAKE_CURRENT_SOURCE_DIR}/tests/run_gcode_parser_integration.sh"
                    "$<TARGET_FILE:linuxcnc-grpc-gcode-parser-integration>")
    endif()

    if(LINUXCNC_GRPC_HAS_SCOPE)
        add_executable(linuxcnc-grpc-scope-controller-contract-tests
            tests/scope_controller_contract_tests.cc)
        target_compile_features(linuxcnc-grpc-scope-controller-contract-tests PRIVATE cxx_std_17)
        target_link_libraries(linuxcnc-grpc-scope-controller-contract-tests PRIVATE
            linuxcnc-grpc-domain)
        target_compile_definitions(linuxcnc-grpc-scope-controller-contract-tests PRIVATE ULAPI)
        target_include_directories(linuxcnc-grpc-scope-controller-contract-tests PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
            "${LINUXCNC_ROOT}/include"
            "${LINUXCNC_ROOT}/src"
            "${LINUXCNC_ROOT}/src/hal"
            "${LINUXCNC_ROOT}/src/hal/utils"
            "${LINUXCNC_ROOT}/src/rtapi")
        target_compile_options(linuxcnc-grpc-scope-controller-contract-tests PRIVATE
            -Wall -Wextra -Wpedantic)
        add_test(NAME linuxcnc-grpc-scope-controller-contract-tests
                 COMMAND linuxcnc-grpc-scope-controller-contract-tests)
    endif()
endif()
