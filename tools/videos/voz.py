# Genera la narración con Kokoro (voz neuronal, corre en la máquina, sin enviar texto a ningún servicio).
# Uso: python3 voz.py <modelo.onnx> <voces.bin> <voz> <velocidad>   y por la entrada: JSON [[texto, archivo.wav], ...]
import sys, json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro(sys.argv[1], sys.argv[2])
for texto, archivo in json.load(sys.stdin):
    audio, sr = k.create(texto, voice=sys.argv[3], speed=float(sys.argv[4]), lang='es')
    sf.write(archivo, audio, sr)
