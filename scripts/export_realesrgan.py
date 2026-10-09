"""
Exporta o Real-ESRGAN "realesr-general-x4v3" (BSD-3) para ONNX com eixos dinâmicos,
para rodar em tiles no ONNX Runtime Mobile.

    pip install torch basicsr realesrgan onnx
    python scripts/export_realesrgan.py
"""
import urllib.request
from pathlib import Path

import torch
from realesrgan.archs.srvgg_arch import SRVGGNetCompact

URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth"
out_dir = Path(__file__).resolve().parent.parent / "assets" / "models"
out_dir.mkdir(parents=True, exist_ok=True)
pth = out_dir / "realesr-general-x4v3.pth"
if not pth.exists():
    urllib.request.urlretrieve(URL, pth)

model = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4, act_type="prelu")
state = torch.load(pth, map_location="cpu")
model.load_state_dict(state.get("params", state), strict=True)
model.eval()

dummy = torch.rand(1, 3, 128, 128)
torch.onnx.export(
    model,
    dummy,
    out_dir / "realesr-general-x4v3.onnx",
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {2: "h", 3: "w"}, "output": {2: "h4", 3: "w4"}},
    opset_version=17,
)
pth.unlink()
print("✓ realesr-general-x4v3.onnx")
