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
            # Run the feature detection script and return 1 for support, 0 for no support
            "hal_s64_supported": "<!(chmod +x ./scripts/check_hal_s64_support.sh 2>/dev/null; if ./scripts/check_hal_s64_support.sh gcc -I./include/linuxcnc -I/usr/include/linuxcnc -I/usr/local/include/linuxcnc $(if [ -n \"${LINUXCNC_INCLUDE:-}\" ]; then echo \"-I${LINUXCNC_INCLUDE}\"; fi) 2>/dev/null | grep -q 'HAL_S64_SUPPORT'; then echo 1; else echo 0; fi)",
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
          "defines": [],
          "conditions": [
            ["<(hal_s64_supported)==1", {
              "defines": [
                "HAL_S64_SUPPORT"
              ]
            }]
          ]
        }]
      ],
      "defines": [ 
        "NAPI_CPP_EXCEPTIONS"
      ]
    }
  ]
}