{
  "targets": [
    {
      "target_name": "gcode_addon",
      "sources": [
        "src/cpp/gcode_addon.cc",
        "src/cpp/gcode_parser.cc",
        "src/cpp/canon_preview.cc",
        "src/cpp/parse_worker.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!(python3 -c \"import sysconfig; print(sysconfig.get_path('include'))\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='linux'", {
          "variables": {
            "linuxcnc_include_dirs": [
              "<!(echo ${LINUXCNC_INCLUDE:-/usr/include/linuxcnc})",
              "/usr/include/linuxcnc",
              "/usr/local/include/linuxcnc"
            ],
          },
          "include_dirs": [
            "<@(linuxcnc_include_dirs)"
          ],
          "libraries": [
            "-lrs274",
            "-llinuxcncini",
            "-lnml",
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
