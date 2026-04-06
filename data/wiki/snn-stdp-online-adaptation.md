---
{
  "id": "snn-stdp-online-adaptation",
  "name": "SNN-STDP 在线适应学习",
  "aliases": [
    "Spiking Neural Network STDP",
    "脉冲神经网络时序依赖可塑性",
    "Spike-Timing-Dependent Plasticity"
  ],
  "domain": "Neuromorphic Computing",
  "summary": "基于脉冲神经网络（SNN）和突触时序依赖可塑性（STDP）学习规则的在线无监督学习方法，模拟生物神经突触的赫布学习机制。在 WiFi 感知等场景中，可实现部署后 <30 秒自动适应新环境，无需额外标注数据或重新训练。",
  "relations": [
    {
      "conceptId": "wifi-csi-human-sensing",
      "conceptName": "WiFi CSI 人体感知",
      "type": "enables",
      "description": "SNN-STDP 解决 WiFi CSI 感知系统的环境泛化难题"
    },
    {
      "conceptId": "edge-ai-extreme-quantization",
      "conceptName": "边缘AI极致量化",
      "type": "related",
      "description": "SNN 的事件驱动特性与极致量化互补，共同支撑边缘部署"
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
    "脉冲神经网络",
    "STDP",
    "在线学习",
    "无监督",
    "神经形态计算",
    "环境适应",
    "赫布学习"
  ],
  "createdAt": "2026-04-04T03:58:16.272Z",
  "updatedAt": "2026-04-04T03:58:16.272Z"
}
---

## 是什么

SNN-STDP 是一种受生物神经系统启发的在线学习方法，结合了脉冲神经网络（Spiking Neural Network）和突触时序依赖可塑性（Spike-Timing-Dependent Plasticity）学习规则。

**脉冲神经网络（SNN）** 不同于传统 ANN 的连续激活值，SNN 神经元通过离散的脉冲（spike）通信，更接近生物神经元的工作方式。信息编码在脉冲的时序模式中而非幅度中。

**STDP 学习规则** 基于赫布学习（Hebbian learning）：如果突触前神经元在突触后神经元之前发放脉冲，则突触增强（长时程增强 LTP）；反之则减弱（长时程抑制 LTD）。这种学习完全是无监督的，不需要标注数据或反向传播。

在 RuView 系统中，SNN-STDP 用于环境适应：当系统部署到新房间时，STDP 自动调整网络权重以匹配新环境的 WiFi CSI 特征分布，声称 <30 秒即可完成校准。

## 能做什么

- **零样本环境适应**：部署到全新环境后自动校准，无需收集训练数据
- **持续学习**：随环境缓慢变化（如家具移动）自动更新模型
- **低功耗计算**：SNN 的事件驱动特性天然适合低功耗边缘设备
- **实时在线学习**：无需离线训练阶段，边运行边学习
- **LoRA 房间适配器**：RuView 中每个环境仅需 2,048 个参数的适配器

应用场景包括：WiFi 感知的跨环境泛化、传感器漂移补偿、异常检测中的正常模式学习等。

## 现状与局限

- **理论与工程差距**：STDP 的收敛性和稳定性在复杂任务上缺乏理论保证
- **精度上限**：无监督 STDP 学习的表征能力通常不如有监督的反向传播训练
- **硬件生态不成熟**：专用神经形态芯片（如 Intel Loihi、IBM TrueNorth）尚未大规模商用
- **验证不充分**：RuView 中声称的 <30 秒适应能力缺乏跨环境、跨场景的充分验证
- **与传统 DL 的集成**：如何在同一系统中有效结合 SNN（适应层）和 CNN/Transformer（特征提取层）仍是开放问题