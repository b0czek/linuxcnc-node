{
  "targets": [
    {
      "target_name": "hal_addon",
      "sources": [
        "src/cpp/hal_addon.cc",
        "src/cpp/hal_component.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        # when linuxcnc is not installed, but compiled from source, it should be passed through the environment variable LINUXCNC_INCLUDE
        "<!(echo $LINUXCNC_INCLUDE)"

      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions", "-std=c++17" ], # Use C++17 for std::filesystem if needed, or modern C++ features
      "conditions": [
        ["OS=='linux'", {
          "libraries": [
            "-llinuxcnchal" # Links against liblinuxcnchal.so
          ],

          "library_dirs": [
            # If liblinuxcnchal.so is not in a standard library path:
            "<!(echo $LINUXCNC_LIB)"
          ],
          "cflags_cc": [ "-std=c++17" ] # Ensure C++17 for Linux too
        }]
      ],
      "defines": [ "NAPI_CPP_EXCEPTIONS" ]
    }
  ]
}