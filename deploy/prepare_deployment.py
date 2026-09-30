"""Prepare one rollout, preferring nodes already running healthy app instances."""

import json
import sys
from pathlib import Path


def verify_deployment_images(manifest, expected_image):
    spec = manifest['spec']['template']['spec']
    images = {
        container['name']: container.get('image')
        for container in spec.get('containers', []) + spec.get('initContainers', [])
    }
    if any(images.get(name) != expected_image for name in ('widget-demo', 'migrate')):
        raise ValueError('Deployment application and migration images must match the target revision')


def prepare_deployment(manifest, pods, rollout_id):
    template = manifest['spec']['template']
    annotations = template.setdefault('metadata', {}).setdefault('annotations', {})
    annotations['widget-demo/rollout-id'] = rollout_id
    ready_nodes = sorted({
        pod['spec']['nodeName']
        for pod in pods.get('items', [])
        if pod.get('spec', {}).get('nodeName')
        and not pod.get('metadata', {}).get('deletionTimestamp')
        and any(condition.get('type') == 'Ready' and condition.get('status') == 'True'
                for condition in pod.get('status', {}).get('conditions', []))
    })
    if ready_nodes:
        affinity = template['spec'].setdefault('affinity', {}).setdefault('nodeAffinity', {})
        affinity.setdefault('preferredDuringSchedulingIgnoredDuringExecution', []).append({
            'weight': 100,
            'preference': {'matchFields': [{
                'key': 'metadata.name', 'operator': 'In', 'values': ready_nodes,
            }]},
        })
    return manifest


if __name__ == '__main__':
    if sys.argv[1] == '--verify-image':
        verify_deployment_images(json.load(sys.stdin), sys.argv[2])
        print('Deployment application and migration images match the target revision.')
    else:
        current_pods = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        json.dump(prepare_deployment(json.load(sys.stdin), current_pods, sys.argv[2]), sys.stdout)
