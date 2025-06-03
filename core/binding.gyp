{
  "targets": [
    {
      "target_name": "nml_addon",
      "sources": [
        "src/cpp/nml_addon.cc",
        "src/cpp/common.cc",
        "src/cpp/stat_channel.cc",
        "src/cpp/command_channel.cc",
        "src/cpp/error_channel.cc"
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
            "-llinuxcnc",
            "-lnml",
            "-llinuxcncini",
            "-ltooldata"
          ],
          "library_dirs": [
            "/usr/lib",
            "/usr/local/lib", 
            "/usr/lib/x86_64-linux-gnu",
            "<!(echo ${LINUXCNC_LIB:-})"
          ],
          "cflags_cc": [ 
            "-std=c++17",
            "-DULAPI"
          ],
        }]
      ],
      "defines": [ 
        "NAPI_CPP_EXCEPTIONS"
      ]
    }
  ]
}