import base64, os
data = "PLACEHOLDER"
out = os.path.expanduser("~/goose-todo/assets/dog-working.png")
with open(out, "wb") as f:
    f.write(base64.b64decode(data))
print("Written:", out, os.path.getsize(out), "bytes")
