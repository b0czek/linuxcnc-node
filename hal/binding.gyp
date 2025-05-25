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
        
        # Add path to LinuxCNC headers if not in standard system include paths.
        # Example for a typical install:
        "../../linuxcnc/include",
        # "/usr/include/linuxcnc" 
        # Or, if you have a source checkout:
        # "/path/to/linuxcnc-dev/src/hal",
        # "/path/to/linuxcnc-dev/src/rtapi",
        # Ensure these paths are correct for your system.
        # If liblinuxcnchal-dev is installed, they might be in /usr/include.
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
          # If liblinuxcnchal.so is not in a standard library path:
          "library_dirs": [
            "../../linuxcnc/lib" # Example
          ],
          "cflags_cc": [ "-std=c++17" ] # Ensure C++17 for Linux too
        }]
      ],
      "defines": [ "NAPI_CPP_EXCEPTIONS" ]
    }
  ]
}