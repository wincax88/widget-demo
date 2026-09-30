import unittest

from prepare_deployment import prepare_deployment, verify_deployment_images


def manifest():
    return {
        'spec': {'template': {
            'metadata': {'labels': {'app': 'widget-demo'}},
            'spec': {
                'containers': [{'name': 'widget-demo', 'image': 'ghcr.io/wincax88/widget-demo:test'}],
                'envFrom': [{'secretRef': {'name': 'widget-demo'}}],
            },
        }},
    }


def pod(node, ready, deleting=False):
    return {
        'metadata': {'deletionTimestamp': '2026-09-30' if deleting else None},
        'spec': {'nodeName': node},
        'status': {'conditions': [{'type': 'Ready', 'status': 'True' if ready else 'False'}]},
    }


class DeploymentPreparationTests(unittest.TestCase):
    def test_prefers_ready_instance_node_and_ignores_stuck_pending_instance(self):
        result = prepare_deployment(manifest(), {'items': [pod('healthy-node', True), pod('stuck-node', False)]}, '100-1')
        self.assertIn('affinity', result['spec']['template']['spec'])
        node_affinity = result['spec']['template']['spec']['affinity']['nodeAffinity']
        self.assertNotIn('requiredDuringSchedulingIgnoredDuringExecution', node_affinity)
        terms = node_affinity['preferredDuringSchedulingIgnoredDuringExecution']
        self.assertEqual(terms[0]['preference']['matchFields'][0]['values'], ['healthy-node'])

    def test_terminating_instance_is_not_a_cache_target(self):
        result = prepare_deployment(manifest(), {'items': [pod('terminating-node', True, deleting=True)]}, '100-1')
        self.assertNotIn('affinity', result['spec']['template']['spec'])

    def test_no_healthy_instance_keeps_scheduling_unrestricted(self):
        result = prepare_deployment(manifest(), {'items': [pod('stuck-node', False)]}, '100-1')
        self.assertNotIn('affinity', result['spec']['template']['spec'])

    def test_manual_rerun_changes_template_without_changing_image_or_secrets(self):
        first = prepare_deployment(manifest(), {'items': []}, '100-1')
        second = prepare_deployment(manifest(), {'items': []}, '100-2')
        self.assertIn('annotations', first['spec']['template']['metadata'])
        self.assertNotEqual(first['spec']['template']['metadata']['annotations'], second['spec']['template']['metadata']['annotations'])
        self.assertEqual(first['spec']['template']['spec'], second['spec']['template']['spec'])

    def test_preserves_other_affinity_rules(self):
        value = manifest()
        value['spec']['template']['spec']['affinity'] = {'podAntiAffinity': {'preferredDuringSchedulingIgnoredDuringExecution': []}}
        result = prepare_deployment(value, {'items': [pod('healthy-node', True)]}, '100-1')
        self.assertIn('podAntiAffinity', result['spec']['template']['spec']['affinity'])

    def test_rejects_previous_application_image(self):
        value = manifest()
        value['spec']['template']['spec']['initContainers'] = [{'name': 'migrate', 'image': 'expected'}]
        with self.assertRaises(ValueError):
            verify_deployment_images(value, 'expected')

    def test_rejects_previous_migration_image(self):
        value = manifest()
        value['spec']['template']['spec']['containers'][0]['image'] = 'expected'
        value['spec']['template']['spec']['initContainers'] = [{'name': 'migrate', 'image': 'old'}]
        with self.assertRaises(ValueError):
            verify_deployment_images(value, 'expected')

    def test_accepts_matching_application_and_migration_images(self):
        value = manifest()
        value['spec']['template']['spec']['containers'][0]['image'] = 'expected'
        value['spec']['template']['spec']['initContainers'] = [{'name': 'migrate', 'image': 'expected'}]
        verify_deployment_images(value, 'expected')


if __name__ == '__main__':
    unittest.main()
