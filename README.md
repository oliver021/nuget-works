## NuGet Posts
GitHub action to build, pack & publish either single packgage from project or many packages
from a directory that contains .csproj files. In fact, this action is oriented to work with
complex workflow and various cases. 

### Works with many projects

I found a need to supply functionality for the case of wanting to configure in a single step the publication of several projects within a folder or in a list that can be pointed to using the path: `PROJECTS.txt`. Of course you can also set a project file path if you want to only pack a single project.

### Works with many sources

You can also save a lot of time configuring your workflow steps by setting the property: `NUGET_SOURCE` to multiple sources at once if you wish, which will require you to set multiple keys to `NUGET_KEY`, both properties for multiple sources must use "first,second,etc" separated by commas. For `NUGET_SOURCE` you have the following example: "https://nuget1.com,https://nuget2.com" in this case in the key property you must also set the corresponding key for each server.

## Get Started

To use this action you can create new .github/workflows/nuget-publish.yml file:

```yml
name: publish packages
on:
  push:
    branches:
      - main
jobs:
  publish:
    name: publish nugets packages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup .NET Core  
        uses: actions/setup-dotnet@v1  
        with:  
            dotnet-version: '5.0.x'
        run: dotnet restore 
      # Publish the packages
      - name: publish packages
        id: publish_nuget
        uses: oliver021/nuget-works@v1
        with:
          # As simple as set the root source directory.
            TARGET: "src"
          
          # Parameter for 'dotnet build' Configuration to build and package.
          # BUILD_CONFIGURATION: Release
          
          # Parameter for 'dotnet build' Platform target to compile.
          # BUILD_PLATFORM: x64          
          
          # NuGet package id, used the standard tag markup
          # NAME_REGEX: ^\s*<PackageId>(.*)<\/PackageId>\s*$

          # Regex pattern to extract version info in a capturing standard tag markup
          # VERSION_REGEX: ^\s*<Version>(.*)<\/Version>\s*$
          
          # Tag option to git tag
          # TAG: empty
          # this options release a new tag in your repo if all packages was pushed successfully
          
          # Timeout in seconds for push action
          # NUGET_TIMEOUT: 300
          
          # API key to authenticate with NuGet server
            NUGET_KEY: ${{secrets.NUGET_APIKEY}}
          # NUGET_KEY: ${{secrets.NUGET_APIKEY}},${{secrets.GITHUB_APIKEY}}

          # NuGet server location, defaults to https://api.nuget.org
          # NUGET_SOURCE: https://api.nuget.org
          # NUGET_SOURCE: https://api.nuget.org,https://nuget.pkg.github.com/OWNER
          # Nota: the nuget source using prefix "v3" for all server that are not "github" host

          # Flag to toggle pushing symbols along with nuget package to the server, disabled by default
          # INCLUDE_SYMBOLS: false
```

The file above show the very simple sample configuration that you can use for yours workflows. Finally the action export two variable in oyt named `FOUND_PACKAGES` and `PUSHED_PACKAGES` both are integer.
