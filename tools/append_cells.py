"""Append the dashboard export cells (tools/notebook_cells/*.py, '# %%' blocks) to a copy of a notebook."""
import json, re, sys, uuid

src_nb, cells_py, out_nb = sys.argv[1:4]
nb = json.load(open(src_nb, encoding="utf-8"))
text = open(cells_py, encoding="utf-8").read()
blocks = re.split(r"^# %%", text, flags=re.M)
intro = [l[2:] if l.startswith("# ") else l.lstrip("#") for l in blocks[0].strip().splitlines()]

def lines(s):
    s = s.strip("\n").splitlines()
    return [l + "\n" for l in s[:-1]] + ([s[-1]] if s else [])

new = [{"cell_type": "markdown", "id": uuid.uuid4().hex[:8], "metadata": {},
        "source": lines("---\n**Dashboard export** (added for the website)\n\n" + "\n".join(intro))}]
for b in blocks[1:]:
    head, _, body = b.partition("\n")
    head = head.strip()
    cid = uuid.uuid4().hex[:8]
    if head.startswith("[markdown]"):
        md = "\n".join(l[2:] if l.startswith("# ") else l.lstrip("#") for l in body.strip().splitlines())
        new.append({"cell_type": "markdown", "id": cid, "metadata": {}, "source": lines(md)})
    else:
        code = (f"# {head}\n" if head else "") + body
        new.append({"cell_type": "code", "id": cid, "metadata": {}, "execution_count": None, "outputs": [], "source": lines(code)})
nb["cells"].extend(new)
nb.setdefault("nbformat_minor", 5)
if nb.get("nbformat_minor", 0) < 5:
    nb["nbformat_minor"] = 5
json.dump(nb, open(out_nb, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(out_nb, "->", len(new), "cells appended,", len(nb["cells"]), "total")
