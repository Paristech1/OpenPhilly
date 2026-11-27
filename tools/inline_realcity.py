"""Re-inline realcity/src/realcity5.js to realcity8.js into realcity/index.html.

Each file sits between its '// ====... realcityN.js' marker and the next marker (the last one ends at boot();).
Run from the repo root:  python3 tools/inline_realcity.py
"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent / 'realcity'
html = (root / 'index.html').read_text()
MARK = '// ================================================================ realcity{}.js\n'
END = '\nboot();\n</script>'
names = [5, 6, 7, 8]
start = html.index(MARK.format(5))
end = html.index(END)
body = ''.join(MARK.format(n) + (root / 'src' / f'realcity{n}.js').read_text().rstrip('\n') + '\n\n' for n in names)
html = html[:start] + body.rstrip('\n') + '\n' + html[end:]
(root / 'index.html').write_text(html)
print('inlined', ', '.join(f'realcity{n}.js' for n in names))
