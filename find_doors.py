from pathlib import Path
text = Path('components/main-area.tsx').read_text(encoding='latin-1')
pos = 0
while True:
    idx = text.find('doors', pos)
    if idx == -1:
        break
    print(idx, repr(text[idx-20:idx+20]))
    pos = idx + 1
