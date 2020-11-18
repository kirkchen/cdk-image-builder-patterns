import { MachineImage, WindowsVersion } from '@aws-cdk/aws-ec2';
import { IMachineImage } from '@aws-cdk/aws-ec2/lib/machine-image';
import { CfnInstanceProfile, ManagedPolicy, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import {
  CfnComponent,
  CfnImagePipeline,
  CfnImageRecipe,
  CfnInfrastructureConfiguration,
} from '@aws-cdk/aws-imagebuilder';
import { Construct } from '@aws-cdk/core';

const defaultProps: JenkinsWindowsWorkerImageBuilderProps = {
  version: '1.0.0',
  instanceTypes: ['t2.medium'],
};

export interface JenkinsWindowsWorkerImageBuilderProps {
  readonly version: string;
  readonly instanceTypes: string[];
  readonly baseImage?: IMachineImage;
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
  constructor(scope: Construct, id: string, props: JenkinsWindowsWorkerImageBuilderProps = defaultProps) {
    super(scope, id);

    const { version, instanceTypes, baseImage } = props;

    const baseImageAmiId = baseImage ? baseImage.getImage(this).imageId : MachineImage.latestWindows(
      WindowsVersion.WINDOWS_SERVER_2016_ENGLISH_FULL_BASE,
    ).getImage(this).imageId;


    const setupWinRMComponent = new CfnComponent(this, 'SetupWinRM', {
      name: 'Setup WinRM',
      platform: 'Windows',
      version,
      data: setupWinRMData,
    });
    const enableSmb1 = new CfnComponent(this, 'EnableSmb1', {
      name: 'Enable smb1',
      platform: 'Windows',
      version,
      data: enableSmb1Data,
    });

    const installBuildTools = new CfnComponent(this, 'InstallBuildTools', {
      name: 'Install Build Tools',
      platform: 'Windows',
      version,
      data: installBuildToolsData,
    });

    const jenkinsWindowsWorkerRecipe = new CfnImageRecipe(
      this,
      'JenkinsWindowsWorkerRecipe',
      {
        name: 'JenkinsWindowsWorkerRecipe',
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

    const windowsBuilderRole = new Role(this, 'WindowsBuilderRole', {
      roleName: 'WindowsBuilderRole',
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

    const windowsBuilderInstanceProfile = new CfnInstanceProfile(
      this,
      'WindowsBuilderInstanceProfile',
      {
        instanceProfileName: 'WindowsBuilderInstanceProfile',
        roles: [windowsBuilderRole.roleName],
      },
    );

    const windowsImageBuilderInfraConfig = new CfnInfrastructureConfiguration(
      this,
      'WindowsImageBuilderConfig',
      {
        name: 'WindowsImageBuilderConfig',
        instanceTypes,
        instanceProfileName: windowsBuilderInstanceProfile.instanceProfileName!,
      },
    );
    windowsImageBuilderInfraConfig.addDependsOn(windowsBuilderInstanceProfile);

    new CfnImagePipeline(this, 'JenkinsWindowsWorkerPipeline', {
      name: 'JenkinsWindowsWorkerPipeline',
      imageRecipeArn: jenkinsWindowsWorkerRecipe.attrArn,
      infrastructureConfigurationArn: windowsImageBuilderInfraConfig.attrArn,
    });
  }
}
