---
permalink: /
title: ""
excerpt: ""
author_profile: true
redirect_from:
  - /about/
  - /about.html
---

<span class='anchor' id='about-me'></span>

I am actively seeking Ph.D. opportunities in robot control, data-driven motion planning, and generative motion planning for real robotic systems.

I am an M.S. student in Electronic Information at Hunan University, advised by Prof. Zhiqiang Miao and Prof. Yaonan Wang. My research centers on robot control and data-driven motion planning for real robotic systems, especially how learned planners can incorporate dynamics, feedback, and constraints to generate motions that are feasible to execute.

My current work explores generative planning from real robot data, with a focus on constraint-satisfying motion generation under physical limits and system uncertainty.

<span class='anchor' id='news'></span>

# 🔥 News

- *Aug 2026:* Our SubCat paper on model-predictive control for a compact vectored-thrust underwater robot appears in IEEE Robotics and Automation Letters.
- *May 2026:* Our work on safety-guaranteed fault-tolerant NMPC for underwater vehicles appears in IEEE Robotics and Automation Letters.
- *Oct 2025:* Our work on passive fault-tolerant control under actuator faults and disturbances appears at IEEE/RSJ IROS 2025.

<span class='anchor' id='publications'></span>

# 📝 Publications

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">RA-L 2026</div><img src="{{ '/pub_vid/subcat_demo_2.gif' | relative_url }}" alt="SubCat underwater robot demonstration" width="100%" loading="lazy"></div></div>
<div class='paper-box-text' markdown="1">

**SubCat: Design and Control of a Vectored-Thrust Underwater Robot with Model Predictive Control**

**Jun Wei**, Zhiqiang Miao, Yizong Chen, Xinjiang Liu, Yaonan Wang

*IEEE Robotics and Automation Letters (RA-L), Aug 2026*
</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">RA-L 2026</div><img src="{{ '/pub_vid/ftnmpc_demo_1.gif' | relative_url }}" alt="Fault-tolerant NMPC underwater vehicle demonstration" width="100%" loading="lazy"></div></div>
<div class='paper-box-text' markdown="1">

**Fault-Tolerant NMPC with Safety Guarantees for Underwater Vehicles**

**Jun Wei**, Zhiqiang Miao, Jinbao Zhang, Yizong Chen, Yaonan Wang

*IEEE Robotics and Automation Letters (RA-L), May 2026*

[Paper](https://ieeexplore.ieee.org/document/11520264)
</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">IROS 2025</div><img src="{{ '/pub_vid/iros2025_demo.gif' | relative_url }}" alt="IROS 2025 underwater vehicle fault-tolerant control demonstration" width="100%" loading="lazy"></div></div>
<div class='paper-box-text' markdown="1">

**Dual-Mode Passive Fault-Tolerant Control for Underwater Vehicles with Actuator Faults and Time-Varying Disturbances**

Yizong Chen<sup>&#42;</sup>, **Jun Wei**<sup>&#42;</sup>, Zhiqiang Miao, Kangcheng Liu, Yaonan Wang

*IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS), Oct 2025*

*Equal contribution.* [Paper](https://ieeexplore.ieee.org/document/11247724)
</div>
</div>

<span class='anchor' id='projects'></span>

# 💻 Projects

- [**underwater_ros2_control**](https://github.com/JunWeiaa/underwater_ros2_control): ROS 2 control stack for underwater robot experiments and real-world platform integration.

<div class="project-gif-grid">
<img src="{{ '/pub_vid/underwater_ros2_control_demo_1.gif' | relative_url }}" alt="underwater_ros2_control demonstration 1" width="100%" loading="lazy">
<img src="{{ '/pub_vid/underwater_ros2_control_demo_2.gif' | relative_url }}" alt="underwater_ros2_control demonstration 2" width="100%" loading="lazy">
<img class="crop-from-bottom" src="{{ '/pub_vid/underwater_ros2_control_demo_3.gif' | relative_url }}" alt="underwater_ros2_control demonstration 3" width="100%" loading="lazy">
</div>

- [**tag_ekf_localization**](https://github.com/JunWeiaa/tag_ekf_localization): Tag-based EKF localization project for robot state estimation.
