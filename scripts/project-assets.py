"""Build-time execution of the exact teaching code; no alternate projection formulas."""
from pathlib import Path
import json
import numpy as np

def project_assets(root):
    root = Path(root)
    sources = json.loads((root / '.asset-build/sources.json').read_text())
    report = []
    for quality in ('overview', 'detail'):
        folder = root / '.asset-build'
        lon = np.fromfile(folder / f'{quality}-lon.bin', dtype='<f8')
        lat = np.fromfile(folder / f'{quality}-lat.bin', dtype='<f8')
        for source in sources:
            namespace = {'np': np}
            exec(compile(source['code'], source['id'] + '.py', 'exec'), namespace)
            with np.errstate(all='ignore'):
                x, y = namespace['project'](lon.copy(), lat.copy())
            x, y = np.asarray(x, dtype='<f8'), np.asarray(y, dtype='<f8')
            assert x.shape == lon.shape and y.shape == lat.shape
            for axis, values in (('x', x), ('y', y)):
                values.tofile(folder / f"{quality}-{source['id']}-{axis}.bin")
            report.append({'quality': quality, 'preset': source['id'], 'samples': len(lon),
                           'omitted': int((~(np.isfinite(x) & np.isfinite(y))).sum())})
    (root / '.asset-build/python-report.json').write_text(json.dumps(report, indent=2))
    return report

if __name__ == '__main__':
    import sys
    result = project_assets(sys.argv[1] if len(sys.argv) > 1 else Path.cwd())
    print(f"Executed {len(result)} canonical Python presets")
