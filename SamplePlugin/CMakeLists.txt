# ===================================================================
#  CMakeList.txt
#  MCPStudio - Custom Tool SDK
#
#  Created by EoF Software Labs on 2026.
#  Copyright © 2026 EoF Software Labs. All rights reserved.
# ===================================================================

# Set the minimum version of CMake
cmake_minimum_required(VERSION 3.25)

project(SampleToolBundle VERSION 1.0.0)

# Add subdirectories for each target
add_subdirectory(dylib)
add_subdirectory(bundle)
