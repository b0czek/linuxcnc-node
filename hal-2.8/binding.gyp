{
  "targets": [
    {
      "target_name": "hal_addon",
      "sources": [
        "src/cpp/hal_addon.cc",
        "src/cpp/hal_component.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='linux'", {
          "variables": {
            # Define include directories as a variable so we can reuse them
            "hal_include_dirs": [
              "./include/linuxcnc",
              "/usr/include/linuxcnc", 
              "/usr/local/include/linuxcnc",
              "<!(echo ${LINUXCNC_INCLUDE:-})"
            ],
          },
          "include_dirs": [
            "<@(hal_include_dirs)"
          ],
          "libraries": [
            "-llinuxcnchal" # Links against liblinuxcnchal.so
          ],
          "library_dirs": [
            "/usr/lib",
            "/usr/local/lib", 
            "/usr/lib/x86_64-linux-gnu",
            "<!(echo ${LINUXCNC_LIB:-})"
          ],
          "cflags_cc": [ 
            "-std=c++17",
            "-DULAPI"  # Required define for hal.h
          ],
          "defines": []
        }]
      ],
      "defines": [ 
        "NAPI_CPP_EXCEPTIONS"
      ]
    }
  ]
}