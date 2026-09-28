import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Sealos application identity', () => {
  it('uses the registered app code, independently of the existing API route prefix', () => {
    const root = resolve(__dirname, '../../..');
    const manifest = readFileSync(resolve(root, 'deploy/k8s/configmap.yaml'), 'utf8');
    expect(manifest).toMatch(/^  EDUPLUS_APP_CODE: widget-demo\r?$/m);
    const controller = readFileSync(resolve(root, 'backend/src/widgets/widgets.controller.ts'), 'utf8');
    expect(controller).toContain('v1/open/demo-school/widgets');
  });
});
