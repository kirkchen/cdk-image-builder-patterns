import { App, Stack } from '@aws-cdk/core';
import { JenkinsWindowsWorkerImageBuilder } from '../src';

test('JenkinsWindowsWorkerImageBuilder', () => {
  const app = new App();
  const stack = new Stack(app, 'test');

  const subject = new JenkinsWindowsWorkerImageBuilder(stack, 'test');

  expect(subject).toMatchSnapshot();
});
