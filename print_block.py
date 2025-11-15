from pathlib import Path
data = Path('components/main-area.tsx').read_text(encoding='latin-1')
marker = '          {view === "doors" && ('
idx = data.index(marker)
print(data[idx-200:idx+500])
