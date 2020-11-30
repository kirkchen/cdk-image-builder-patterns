import { App, Stack } from '@aws-cdk/core';
import { JenkinsWindowsWorkerImageBuilder } from './index';

const app = new App();
const stack = new Stack(app, 'test');

new JenkinsWindowsWorkerImageBuilder(stack, 'test', {
  version: '1.0.0',
  instanceTypes: ['t2.medium'],
  instanceProfileName: 'instanceProfileName',
});
