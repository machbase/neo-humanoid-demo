Unitree G1 Visual Assets
========================

Source:

```text
https://github.com/unitreerobotics/unitree_ros
robots/g1_description/g1_29dof_rev_1_0.urdf
robots/g1_description/meshes/*.STL referenced by the URDF
```

License:

```text
BSD 3-Clause License
Copyright (c) 2016-2022 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")
```

Usage in this demo:

```text
The browser loads the URDF and STL meshes as a visual-only Unitree G1 shell.
Motion playback maps Humanoid Everyday leg_state and arm_state arrays to
the corresponding G1 revolute joint names. If loading fails, the procedural
humanoid mesh in public/app.js remains visible as the fallback.
```
