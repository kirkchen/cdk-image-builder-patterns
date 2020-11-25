import { MachineImage, WindowsVersion } from '@aws-cdk/aws-ec2';
import { IMachineImage } from '@aws-cdk/aws-ec2/lib/machine-image';
import { CfnInstanceProfile, ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import {
  CfnComponent,
  CfnImagePipeline,
  CfnImageRecipe,
  CfnInfrastructureConfiguration,
} from '@aws-cdk/aws-imagebuilder';
import { Construct, Stack } from '@aws-cdk/core';
import ComponentConfigurationProperty = CfnImageRecipe.ComponentConfigurationProperty;

const defaultProps: JenkinsWindowsWorkerImageBuilderProps = {
  version: '1.0.0',
  instanceTypes: ['t2.medium'],
};

export interface JenkinsWindowsWorkerImageBuilderProps {
  readonly version: string;
  readonly instanceTypes: string[];
  readonly baseImage?: IMachineImage;
  readonly imageBuilderRoleArn?: string;
}

const enableSmb1Data = `
name: Enable smb1
description: Enable smb1
schemaVersion: 1.0

phases:
  - name: build
    steps:
      - name: Install
        action: ExecutePowerShell
        inputs:
          commands:
            - Enable-WindowsOptionalFeature -Online -FeatureName smb1protocol -NoRestart
            - Set-SmbServerConfiguration -EnableSMB1Protocol $true -Confirm:$true -Force
            - set-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters SMB1 -Type DWORD -Value 1 -Force
            - Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False
`;

const setupWinRMData = `
name: Setup WinRM
description: Setup WinRM
schemaVersion: 1.0

phases:
  - name: build
    steps:
      - name: Install
        action: ExecutePowerShell
        inputs:
          commands:
            - cmd.exe /c winrm quickconfig -q
            - cmd.exe /c winrm quickconfig '-transport:http'
            - cmd.exe /c winrm set "winrm/config" '@{MaxTimeoutms="1800000"}'
            - cmd.exe /c winrm set "winrm/config/winrs" '@{MaxMemoryPerShellMB="4096"}'
            - cmd.exe /c winrm set "winrm/config/service" '@{AllowUnencrypted="true"}'
            - cmd.exe /c winrm set "winrm/config/client" '@{AllowUnencrypted="true"}'
            - cmd.exe /c winrm set "winrm/config/service/auth" '@{Basic="true"}'
            - cmd.exe /c winrm set "winrm/config/client/auth" '@{Basic="true"}'
            - cmd.exe /c winrm set "winrm/config/listener?Address=*+Transport=HTTP" '@{Port="5985"}'
            - cmd.exe /c netsh advfirewall firewall set rule group="remote administration-winrm" new enable=yes
            - cmd.exe /c netsh firewall add portopening TCP 5985 "Port 5985"
            - cmd.exe /c net stop winrm
            - cmd.exe /c sc config winrm start= auto
            - cmd.exe /c net start winrm
`;

const installBuildToolsData = `
name: Install Build Tools
description: Install Build Tools
schemaVersion: 1.0

phases:
  - name: build
    steps:
      - name: InstallBuildTools
        action: ExecutePowerShell
        inputs:
          commands:
            - Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((new-object net.webclient).DownloadString('https://chocolatey.org/install.ps1'))
            - cinst git -y
            - cinst jdk8 -y
`;

export class JenkinsWindowsWorkerImageBuilder extends Construct {
  private recipe: CfnImageRecipe;

  constructor(scope: Construct, id: string, props: JenkinsWindowsWorkerImageBuilderProps = defaultProps) {
    super(scope, id);

    const { version, instanceTypes, baseImage } = props;
    const stackName = Stack.of(this).stackName;

    const baseImageAmiId = baseImage ? baseImage.getImage(this).imageId : MachineImage.latestWindows(
      WindowsVersion.WINDOWS_SERVER_2016_ENGLISH_FULL_BASE,
    ).getImage(this).imageId;


    const setupWinRMComponent = new CfnComponent(this, 'SetupWinRM', {
      name: `${stackName}-setup-winrm`,
      platform: 'Windows',
      version,
      data: setupWinRMData,
    });

    const enableSmb1 = new CfnComponent(this, 'EnableSmb1', {
      name: `${stackName}-enable-smb1`,
      platform: 'Windows',
      version,
      data: enableSmb1Data,
    });

    const installBuildTools = new CfnComponent(this, 'InstallBuildTools', {
      name: `${stackName}-install-build-tools`,
      platform: 'Windows',
      version,
      data: installBuildToolsData,
    });

    const jenkinsWindowsWorkerRecipe = new CfnImageRecipe(
      this,
      `${stackName}-jenkins-windows-worker-recipe`,
      {
        name: `${stackName}-jenkins-windows-worker-recipe`,
        version,
        components: [
          {
            componentArn: setupWinRMComponent.attrArn,
          },
          {
            componentArn: enableSmb1.attrArn,
          },
          {
            componentArn: installBuildTools.attrArn,
          },
        ],
        parentImage: baseImageAmiId,
      },
    );
    this.recipe = jenkinsWindowsWorkerRecipe;

    const windowsBuilderRole = props.imageBuilderRoleArn ? Role.fromRoleArn(this, `${stackName}-windows-builder-role`, props.imageBuilderRoleArn) : this.createBuilderRole();
    const windowsBuilderInstanceProfile = new CfnInstanceProfile(
      this,
      `${stackName}-windows-builder-instance-profile`,
      {
        instanceProfileName: `${stackName}-windows-builder-instance-profile`,
        roles: [windowsBuilderRole.roleName],
      },
    );

    const windowsImageBuilderInfraConfig = new CfnInfrastructureConfiguration(
      this,
      `${stackName}-windows-image-builder-config`,
      {
        name: `${stackName}-windows-image-builder-config`,
        instanceTypes,
        instanceProfileName: windowsBuilderInstanceProfile.instanceProfileName!,
      },
    );
    windowsImageBuilderInfraConfig.addDependsOn(windowsBuilderInstanceProfile);

    new CfnImagePipeline(this, `${stackName}-jenkins-windows-worker-pipeline`, {
      name: `${stackName}-jenkins-windows-worker-pipeline`,
      imageRecipeArn: jenkinsWindowsWorkerRecipe.attrArn,
      infrastructureConfigurationArn: windowsImageBuilderInfraConfig.attrArn,
    });
  }

  private createBuilderRole() {
    const stackName = Stack.of(this).stackName;
    const windowsBuilderRole = new Role(this, `${stackName}-windows-builder-role`, {
      roleName: `${stackName}-windows-builder-role`,
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
    });
    windowsBuilderRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );
    windowsBuilderRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'EC2InstanceProfileForImageBuilder',
      ),
    );
    return windowsBuilderRole;
  }

  public addComponents(components: CfnComponent[]): void {
    components.map(i => (this.recipe.components as ComponentConfigurationProperty[]).push({ componentArn: i.attrArn }));
  }
}
