# IAPL — SD 1.4

- Paper: [CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/papers/Li_Towards_Generalizable_AI-Generated_Image_Detection_via_Image-Adaptive_Prompt_Learning_CVPR_2026_paper.pdf)
- Official code: https://github.com/liyih/IAPL
- Checkpoint page: https://www.modelscope.cn/models/yihengli/IAPL_pretrain
- Checkpoint: `weights/checkpoint_best_acc_sd14.pth`
- Shared CLIP backbone: `../_shared/clip/ViT-L-14.pt`
- Upstream source: `../../third_party/IAPL`

The adapter preserves the GenImage-style test-time adaptation settings in `model.yaml`. Reducing views or TTA steps changes the inference procedure and should be benchmarked separately.
