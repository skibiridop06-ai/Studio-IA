"""
Gera assets/models/realesr-general-x4v3.onnx a partir dos pesos oficiais do
Real-ESRGAN (BSD-3). A arquitetura SRVGGNetCompact está definida aqui mesmo,
então só precisa de torch + onnx (sem basicsr/realesrgan).

    pip install torch onnx
    python scripts/export_realesrgan.py
"""
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth"


class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList()
        self.body.append(nn.Conv2d(num_in_ch, num_feat, 3, 1, 1))
        self.body.append(nn.PReLU(num_parameters=num_feat))
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
            self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


out_dir = Path(__file__).resolve().parent.parent / "assets" / "models"
out_dir.mkdir(parents=True, exist_ok=True)
onnx_path = out_dir / "realesr-general-x4v3.onnx"
if onnx_path.exists():
    print("✓ realesr-general-x4v3.onnx já existe")
    raise SystemExit(0)

pth = out_dir / "realesr-general-x4v3.pth"
if not pth.exists():
    urllib.request.urlretrieve(URL, pth)

model = SRVGGNetCompact()
state = torch.load(pth, map_location="cpu")
model.load_state_dict(state.get("params", state), strict=True)
model.eval()

torch.onnx.export(
    model,
    torch.rand(1, 3, 128, 128),
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {2: "h", 3: "w"}, "output": {2: "h4", 3: "w4"}},
    opset_version=17,
    dynamo=False,
)
pth.unlink()
print("✓ realesr-general-x4v3.onnx")
