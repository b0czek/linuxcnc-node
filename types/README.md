# @linuxcnc-node/types

TypeScript type definitions for LinuxCNC Node.js bindings.

## Overview

This package contains all TypeScript types, interfaces, and enums used across the LinuxCNC Node.js binding ecosystem. It is licensed under the MIT license to allow unrestricted use in any project.

## License

MIT License - This package can be used freely in any project, including proprietary software.

Note: While this types package is MIT licensed, the other `@linuxcnc-node/*` packages that implement functionality using these types are licensed under GPL-2.0. The types themselves (interfaces, enums, and type definitions) are provided under MIT to maximize compatibility and reusability.

## Included Types

### Core Types (`core-*`)
- **LinuxCNCStat**: Complete LinuxCNC system status structure
- **TaskStat**, **MotionStat**, **IoStat**: Subsystem status structures
- **EmcPose**: Position and orientation in 9 degrees of freedom
- **ToolEntry**: Tool table entries
- Enums: TaskMode, TaskState, ExecState, InterpState, TrajMode, MotionType, etc.

### HAL Types (`hal-*`)
- **HalType**, **HalPinDir**, **HalParamDir**: HAL data types and directions
- **HalPinInfo**, **HalSignalInfo**, **HalParamInfo**: HAL item information
- **NativeHalComponent**: Interface for native HAL components
- **HalWatchCallback**: Callback types for watching HAL values

### G-code Types (`gcode-*`)
- **GCodeOperation**: Union type of all G-code operations
- **OperationType**: Enum for operation types (TRAVERSE, FEED, ARC, etc.)
- **ParseOptions**, **ParseProgress**: G-code parsing configuration
- Motion operations: TraverseOperation, FeedOperation, ArcOperation, etc.
- State operations: UnitsChangeOperation, PlaneChangeOperation, etc.

## Usage

```typescript
import { 
  LinuxCNCStat, 
  TaskMode, 
  HalType, 
  OperationType 
} from '@linuxcnc-node/types';
```

## Package Dependencies

This package is used by:
- `@linuxcnc-node/core` - Core NML interface bindings
- `@linuxcnc-node/hal` - HAL bindings for LinuxCNC 2.9+
- `@linuxcnc-node/hal-2.8` - HAL bindings for LinuxCNC 2.8
- `@linuxcnc-node/gcode` - G-code parser

## Contributing

Type definitions should be kept in sync with the LinuxCNC C++ API. When adding new types, ensure they are:
1. Well-documented with TSDoc comments
2. Properly exported from `index.ts`
3. Compatible with all consuming packages

## Version History

- **1.0.0**: Initial release with types extracted from individual packages
