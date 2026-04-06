---
{
  "id": "wifi-csi-human-sensing",
  "name": "WiFi CSI 人体感知",
  "aliases": [
    "WiFi Channel State Information Sensing",
    "WiFi感知",
    "无线信道状态信息感知",
    "DensePose From WiFi"
  ],
  "domain": "Wireless Sensing",
  "summary": "利用 WiFi 信道状态信息（CSI）中子载波的幅度和相位变化，通过深度学习推断人体存在、姿态、活动和生命体征的非视觉感知技术。无需摄像头，天然保护隐私，且具备穿墙能力，但纯 WiFi 模式下姿态估计精度仍远低于视觉方案。",
  "relations": [
    {
      "conceptId": "edge-ai-extreme-quantization",
      "conceptName": "边缘AI极致量化",
      "type": "related",
      "description": "WiFi CSI 感知模型需通过极致量化才能部署到 ESP32 等微控制器"
    },
    {
      "conceptId": "snn-stdp-online-adaptation",
      "conceptName": "SNN-STDP 在线适应学习",
      "type": "related",
      "description": "脉冲神经网络用于 WiFi CSI 感知系统的环境自适应校准"
    }
  ],
  "sources": [
    {
      "entryId": "d96c3c73-d564-40a9-9057-76b8a3ea97b5",
      "entryTitle": "RuView：基于 WiFi CSI 的无摄像头人体感知边缘 AI 平台",
      "date": "2026-04-04T03:56:59.198Z",
      "contribution": "RuView 是一个基于 WiFi CSI（信道状态信息）的开源边缘感知平台，可将普通 WiFi 信号转化为实时人体姿态估计、生命体征监测和存在检测，完全无需摄像头。"
    }
  ],
  "tags": [
    "WiFi",
    "CSI",
    "人体感知",
    "姿态估计",
    "非视觉感知",
    "隐私保护",
    "穿墙",
    "生命体征"
  ],
  "createdAt": "2026-04-04T03:58:16.272Z",
  "updatedAt": "2026-04-04T03:58:16.272Z"
}
---

## 是什么

WiFi CSI 人体感知是一种利用 WiFi 信号的信道状态信息（Channel State Information）实现非接触式人体感知的技术。CSI 描述了 WiFi 信号在多径传播中每个子载波（OFDM subcarrier）的幅度和相位，当人体在信号路径中运动时，其反射、散射会改变 CSI 模式。通过深度学习模型（如编码器-解码器架构）对这些变化进行建模，可以推断人体位置、姿态关键点、呼吸/心率等信息。

学术根基包括：
- **CMU DensePose From WiFi (2023, arXiv:2301.00250)**：首次证明 WiFi 信号可实现与图像方法可比的密集人体姿态估计
- **WiFlow (2026, arXiv:2602.08661)**：提出时空特征解耦的轻量级架构，仅 1.8M 参数
- **WiPose (MobiCom 2020)**：首个商用 WiFi 3D 姿态框架，平均关节误差 2.83cm
- **Person-in-WiFi 3D (CVPR 2024)**：端到端多人 3D 姿态估计

典型信号处理管线：CSI 采集 → Hampel/SpotFi 滤波 → 多视角注意力融合 → 背景减除 → 向量搜索 → 神经网络推理。

## 能做什么

- **存在检测**：判断房间是否有人，可用于智能建筑节能和安防
- **姿态估计**：输出 17 个 COCO 标准人体关键点（精度仍是瓶颈）
- **生命体征监测**：非接触式呼吸（6-30 BPM）、心率（40-120 BPM）、睡眠阶段分析
- **活动识别与跌倒检测**：居家养老场景的关键需求
- **穿墙感知**：WiFi 信号可穿透墙壁，摄像头无法做到
- **人数统计**：通过 MinCut 等算法分离多人信号
- **隐私敏感场所部署**：养老院、医院、学校等不适合安装摄像头的场景

RuView 项目以 ESP32-S3（$9/节点）为硬件基础，全套成本约 $140，展示了低成本部署的可行性。

## 现状与局限

- **精度瓶颈**：纯 WiFi 姿态估计仅 2.5% PCK@20，远低于视觉方案（>70%），存在检测较可靠但精细姿态仍是概念验证阶段
- **环境敏感性**：家具位置、人员密度、电磁干扰都会显著影响 CSI 模式，跨环境泛化是核心挑战
- **训练数据有限**：现有数据集规模小、多样性不足，不同体型和环境布局下的鲁棒性缺乏验证
- **学术成果到工程落地有鸿沟**：多数高精度结果来自实验室环境和高端硬件（如 Intel 5300 NIC），边缘设备上的实际表现需要独立验证
- **商业成熟度低**：相关开源项目多处于 Beta 阶段，距离关键任务部署还有距离