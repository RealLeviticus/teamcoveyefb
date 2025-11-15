from pathlib import Path
text = Path('components/main-area.tsx').read_text(encoding='latin-1')
start = text.index('              {acarsShowComposer && (')
print(text[start:start+400])
