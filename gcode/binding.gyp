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
            "linuxcnc_rip_dir": "<!(node -p \"process.env.EMC2_HOME || process.env.LINUXCNC_HOME || ''\")",
            "linuxcnc_lib_dir": "<!(node -p \"process.env.LINUXCNC_LIB || ''\")",
            "linuxcnc_include_dirs": [
              "<!(echo ${LINUXCNC_INCLUDE:-/usr/include/linuxcnc})",
              "/usr/include/linuxcnc",
              "/usr/local/include/linuxcnc"
            ],
          },
          "include_dirs": [
            "<@(linuxcnc_include_dirs)"
          ],
          "conditions": [
            ["linuxcnc_rip_dir!=''", {
              "include_dirs": [
                "<(linuxcnc_rip_dir)/include",
                "<(linuxcnc_rip_dir)/src",
                "<(linuxcnc_rip_dir)/src/emc",
                "<(linuxcnc_rip_dir)/src/emc/ini",
                "<(linuxcnc_rip_dir)/src/emc/motion",
                "<(linuxcnc_rip_dir)/src/emc/nml_intf",
                "<(linuxcnc_rip_dir)/src/emc/rs274ngc",
                "<(linuxcnc_rip_dir)/src/emc/sai",
                "<(linuxcnc_rip_dir)/src/emc/tooldata",
                "<(linuxcnc_rip_dir)/src/libnml/buffer",
                "<(linuxcnc_rip_dir)/src/libnml/cms",
                "<(linuxcnc_rip_dir)/src/libnml/linklist",
                "<(linuxcnc_rip_dir)/src/libnml/nml",
                "<(linuxcnc_rip_dir)/src/libnml/os_intf",
                "<(linuxcnc_rip_dir)/src/libnml/posemath",
                "<(linuxcnc_rip_dir)/src/libnml/rcs",
                "<(linuxcnc_rip_dir)/src/rtapi"
              ]
            }],
            ["linuxcnc_lib_dir!=''", {
              "ldflags": [
                "-Wl,--disable-new-dtags",
                "-Wl,-rpath,<(linuxcnc_lib_dir)"
              ]
            }]
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
