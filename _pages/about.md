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

<div class="about-intro" markdown="1">

I am actively seeking Ph.D. opportunities in data-driven motion planning and robot control for real robotic systems.

I am an M.S. student in Electronic Information at Hunan University, advised by [Prof. Zhiqiang Miao](https://eeit.hnu.edu.cn/info/1544/5187.htm) and [Prof. Yaonan Wang](https://robotics.hnu.edu.cn/info/1176/3098.htm). My research centers on data-driven motion planning and robot control for real robotic systems, especially how generative planners can incorporate dynamics, feedback, contact constraints, and physical limits to produce reliable motion.

My current work explores flow-matching-based planning from real robot-payload data in previously unseen, partially observed 3D environments.

</div>

<div class="current-work-demo">
<video autoplay loop muted playsinline preload="metadata" aria-label="Flow-matching planner navigating through an environment with 100 obstacles"><source src="{{ '/pub_vid/fm_100_obstacles.mp4' | relative_url }}" type="video/mp4"></video>
<div class="current-work-caption">Flow-matching planner guiding a robot-payload system to the goal through a previously unseen environment with 100 obstacles.</div>
</div>

<span class='anchor' id='news'></span>

# 🔥 News

- *Aug 2026:* Our SubCat paper on model-predictive control for a compact vectored-thrust underwater robot appears in IEEE Robotics and Automation Letters.
- *Jul 2026:* Our Koopman-MPC work for thrust-vectored underwater vehicle control appears in IEEE Robotics and Automation Letters.
- *May 2026:* Our work on safety-guaranteed fault-tolerant NMPC for underwater vehicles appears in IEEE Robotics and Automation Letters.
- *Oct 2025:* Our work on passive fault-tolerant control under actuator faults and disturbances appears at IEEE/RSJ IROS 2025.

<span class='anchor' id='publications'></span>

# 📝 Publications

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">RA-L 2026</div><video width="100%" autoplay loop muted playsinline preload="metadata" aria-label="SubCat underwater robot demonstration"><source src="{{ '/pub_vid/subcat_demo_2.mp4' | relative_url }}" type="video/mp4"></video></div></div>
<div class='paper-box-text' markdown="1">

**SubCat: Design and Control of a Vectored-Thrust Underwater Robot with Model Predictive Control**

**Jun Wei**, Zhiqiang Miao, Yizong Chen, Xinjiang Liu, Yaonan Wang

*IEEE Robotics and Automation Letters (**RA-L**), Aug 2026*

[Paper](https://ieeexplore.ieee.org/document/11661758)
</div>
</div>

<div class="paper-box"><div class="paper-box-image"><div><div class="badge">RA-L 2026</div><img src="{{ '/pub_vid/koopman_mpc_cover_pdf_full.png' | relative_url }}" alt="Koopman-MPC framework diagram"></div></div>
<div class="paper-box-text" markdown="1">

**Weighted Online Koopman Learning for Model Predictive Control of Thrust-Vectored Underwater Vehicles**

Yizong Chen, Zhiqiang Miao, **Jun Wei**, Yaonan Wang

*IEEE Robotics and Automation Letters (**RA-L**), Jul 2026*

[Paper](https://ieeexplore.ieee.org/document/11520253)
</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">RA-L 2026</div><video width="100%" autoplay loop muted playsinline preload="metadata" aria-label="Fault-tolerant NMPC underwater vehicle demonstration"><source src="{{ '/pub_vid/ftnmpc_demo_1.mp4' | relative_url }}" type="video/mp4"></video></div></div>
<div class='paper-box-text' markdown="1">

**Fault-Tolerant NMPC with Safety Guarantees for Underwater Vehicles**

**Jun Wei**, Zhiqiang Miao, Jinbao Zhang, Yizong Chen, Yaonan Wang

*IEEE Robotics and Automation Letters (**RA-L**), May 2026*

[Paper](https://ieeexplore.ieee.org/document/11520264)
</div>
</div>

<div class='paper-box'><div class='paper-box-image'><div><div class="badge">IROS 2025</div><video width="100%" autoplay loop muted playsinline preload="metadata" aria-label="IROS 2025 underwater vehicle fault-tolerant control demonstration"><source src="{{ '/pub_vid/iros2025_demo.mp4' | relative_url }}" type="video/mp4"></video></div></div>
<div class='paper-box-text' markdown="1">

**Dual-Mode Passive Fault-Tolerant Control for Underwater Vehicles with Actuator Faults and Time-Varying Disturbances**

Yizong Chen<sup>&#42;</sup>, **Jun Wei**<sup>&#42;</sup>, Zhiqiang Miao, Kangcheng Liu, Yaonan Wang<br>
<sup>&#42;</sup> Equal contribution

*IEEE/RSJ International Conference on Intelligent Robots and Systems (**IROS 2025**), Oct 2025*

[Paper](https://ieeexplore.ieee.org/document/11247724)
</div>
</div>

<span class='anchor' id='projects'></span>

# 💻 Projects

- [**underwater_ros2_control**](https://github.com/JunWeiaa/underwater_ros2_control): ROS 2 control framework for sim-to-real underwater robot experiments and deployment.

<div class="project-gif-grid">
<video width="100%" autoplay loop muted playsinline preload="metadata" aria-label="underwater_ros2_control demonstration 1"><source src="{{ '/pub_vid/underwater_ros2_control_demo_1.mp4' | relative_url }}" type="video/mp4"></video>
<video width="100%" autoplay loop muted playsinline preload="metadata" aria-label="underwater_ros2_control demonstration 2"><source src="{{ '/pub_vid/underwater_ros2_control_demo_2.mp4' | relative_url }}" type="video/mp4"></video>
<video class="crop-from-bottom" width="100%" autoplay loop muted playsinline preload="metadata" aria-label="underwater_ros2_control demonstration 3"><source src="{{ '/pub_vid/underwater_ros2_control_demo_3.mp4' | relative_url }}" type="video/mp4"></video>
</div>

- [**tag_ekf_localization**](https://github.com/JunWeiaa/tag_ekf_localization): AprilTag-based EKF localization package for ROS robot state estimation.

- [**subcat-hw**](https://github.com/JunWeiaa/subcat-hw.git): Hardware design repository for the SubCat vectored-thrust underwater robot.

- [**BusLink**](https://github.com/JunWeiaa/BusLink): STM32-based multi-bus USB bridge for UART, CAN, SPI, I2C, and PWM.
