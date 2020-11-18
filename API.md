# API Reference

**Classes**

Name|Description
----|-----------
[JenkinsWindowsWorkerImageBuilder](#cdk-image-builder-patterns-jenkinswindowsworkerimagebuilder)|*No description*


**Structs**

Name|Description
----|-----------
[JenkinsWindowsWorkerImageBuilderProps](#cdk-image-builder-patterns-jenkinswindowsworkerimagebuilderprops)|*No description*



## class JenkinsWindowsWorkerImageBuilder  <a id="cdk-image-builder-patterns-jenkinswindowsworkerimagebuilder"></a>



__Implements__: [IConstruct](#constructs-iconstruct), [IConstruct](#aws-cdk-core-iconstruct), [IConstruct](#constructs-iconstruct), [IDependable](#aws-cdk-core-idependable)
__Extends__: [Construct](#aws-cdk-core-construct)

### Initializer




```ts
new JenkinsWindowsWorkerImageBuilder(scope: Construct, id: string, props?: JenkinsWindowsWorkerImageBuilderProps)
```

* **scope** (<code>[Construct](#aws-cdk-core-construct)</code>)  *No description*
* **id** (<code>string</code>)  *No description*
* **props** (<code>[JenkinsWindowsWorkerImageBuilderProps](#cdk-image-builder-patterns-jenkinswindowsworkerimagebuilderprops)</code>)  *No description*
  * **instanceTypes** (<code>Array<string></code>)  *No description* 
  * **version** (<code>string</code>)  *No description* 
  * **baseImage** (<code>[IMachineImage](#aws-cdk-aws-ec2-imachineimage)</code>)  *No description* __*Optional*__




## struct JenkinsWindowsWorkerImageBuilderProps  <a id="cdk-image-builder-patterns-jenkinswindowsworkerimagebuilderprops"></a>






Name | Type | Description 
-----|------|-------------
**instanceTypes** | <code>Array<string></code> | <span></span>
**version** | <code>string</code> | <span></span>
**baseImage**? | <code>[IMachineImage](#aws-cdk-aws-ec2-imachineimage)</code> | __*Optional*__



