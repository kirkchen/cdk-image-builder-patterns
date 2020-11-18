import { App, Stack } from '@aws-cdk/core';
import { JenkinsWindowsWorkerImageBuilder } from './index';

const app = new App();
const stack = new Stack(app, 'test');

new JenkinsWindowsWorkerImageBuilder(stack, 'test');
