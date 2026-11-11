"""Inventário de revisões locais; não interpreta aplicabilidade técnica."""
from pathlib import Path
import re
import sys
import fitz

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"D:\MANUAIS; BULLETINS; NEWLETTERS\RFD\SERVICE BULLETINS")
groups = {}
for path in sorted(ROOT.glob('*.pdf')):
    match = re.match(r'SB\s*(\d+)-(\d+)\s+VER\.?\s*(\d+)', path.name, re.I)
    if not match:
        raise ValueError(f'Nome não reconhecido: {path.name}')
    key = (int(match[1]), int(match[2]))
    # This file was compared byte-for-byte with the 20/18 PDF; its internal
    # header says 20/18, despite the incorrect 28-18 filename.
    if path.name.startswith('SB 28-18 Ver.1 - Hull data label'):
        key = (20, 18)
    groups.setdefault(key, []).append((int(match[3]), path))

print('# Inventário de boletins RFD — revisões locais')
print('\nInventário automático, não é análise nem aprovação de aplicabilidade. A revisão mais recente disponível localmente pode não ser a mais recente publicada.\n')
print('| Boletim | Revisão local | Ficheiro | Páginas | Texto |')
print('|---|---:|---|---:|---|')
for key in sorted(groups, key=lambda x: (x[1], x[0])):
    versions = groups[key]
    latest = max(revision for revision, _ in versions)
    selected = [path for revision, path in versions if revision == latest]
    for path in selected:
        with fitz.open(path) as doc:
            chars = sum(len(page.get_text().strip()) for page in doc)
            pages = len(doc)
        text = 'Sem texto extraível — rever imagens' if chars < 100 else 'Extraível — ainda requer revisão'
        if len(selected) > 1:
            text += '; duplicado de revisão, comparar ficheiros'
        print(f'| {key[0]:02d}/{key[1]:02d} | {latest} | {path.name.replace("|", " ")} | {pages} | {text} |')
