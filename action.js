import { EOL } from "os";
import { lstatSync, existsSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { get } from "https";
import { spawnSync } from "child_process";
import { error } from "console";

// basic constants
const LowVersion = 0;
const UTF8_ENCODING = "utf8";
const DEFAULT_TIME_INPUT_VALUE = "-1";

// several functions to help with process

// print warning format
function warn(msg) {
    console.log(`##[warning] ${msg}`)
}

// print error without exit
function printErr(msg) {
    console.log(`##[error] ${msg}`)
}

// print error and exit
function crash(msg) {
    console.log(`##[error] ${msg}`)
    throw new Error(msg)
}

// run command in process
function runCommand(cmdLine, options) {
    console.log(`executing: [${cmdLine}]`)

    // set command from cmd variable
    const input = cmdLine.split(" ")
    return spawnSync(input[0], input.slice(1), options)
}

// execute command in process
function runProcess(cmd) {
    // execute configure stdio settings
    runCommand(cmd, { 
        encoding: "utf-8",
        stdio: [
            process.stdin,
            process.stdout,
            process.stderr
        ] 
    })
}

// export value as output
function setOutput(key, value){
    process.stdout.write(`::set-output name=${key}::${value}` + EOL)
}

// tag commit and push package
function gitTag(tag) {

    console.log(` creating new tag ${tag}`)
    runProcess(`git tag ${tag}`);
        runProcess(`git push origin ${tag}`);
}

// main class for this action
// this is the entry point for this GitHub Action
// using this class you can:
// - get input values
// - set output values
// - execute commands to publish a new release of your package
// - contains several helper functions to do common tasks
// - detect the intention of publish single or many releases
class Action {

    // set properties setting from env variables
    // the env variables are:
    // - INPUT_TARGET
    // - INPUT_BUILD_CONFIGURATION
    // - INPUT_BUILD_PLATFORM
    // - INPUT_NUGET_KEY
    // - INPUT_NUGET_SOURCE
    // - INPUT_NUGET_TIMEOUT
    // - INPUT_NUSPEC_FILE
    // - INPUT_INCLUDE_SYMBOLS
    // - INPUT_PACKAGE_REGEX
    // - INPUT_VERSION_REGEX
    // - INPUT_TAG
    // by default the env variables are seted by action.yml
    init() {
        // main setings
        this.target = process.env.INPUT_TARGET
        // verify if target not end with .csproj
        if(this.target.endsWith(".csproj")){
            this.targetIsDirectory = lstatSync(this.target).isDirectory()

            // if is not a directory and target ends without .csproj
            // verify if is target PROJECTS.txt
            if(!this.targetIsDirectory && !/\.csproj$/.test(this.target)){
                this.target = join(this.target || "", "PROJECTS.txt");
                this.targetIsCustomList = true;
                // verify if target exist
                if(!existsSync(this.target)){
                    // finally crash 'cause the three rules are broken
                    crash("target file not found");
                }
            }
        }

        // dotnet settings
        this.configuration = process.env.INPUT_BUILD_CONFIGURATION
        this.platform = process.env.INPUT_BUILD_PLATFORM

        // name and version regex settings
        this.nameRegex = new RegExp(process.env.INPUT_PACKAGE_REGEX || process.env.PACKAGE_REGEX, "m")
        this.versionRegex = new RegExp(process.env.INPUT_VERSION_REGEX || process.env.VERSION_REGEX, "m")
        
        // git settings
        this.tag = process.env.INPUT_TAG || process.env.TAG || ""
        
        // nuget settings
        this.nugetKey = process.env.INPUT_NUGET_KEY || process.env.NUGET_KEY
        this.nugetSource = process.env.INPUT_NUGET_SOURCE || process.env.NUGET_SOURCE
        this.nugetServerTimeout = process.env.INPUT_NUGET_TIMEOUT || process.env.NUGET_TIMEOUT
        this.nuspecFile = process.env.INPUT_NUSPEC_FILE
        this.includeSymbols = JSON.parse(process.env.INPUT_INCLUDE_SYMBOLS || process.env.INCLUDE_SYMBOLS)
        
        // output variables
        this.successPackages = 0;

        // verify if nugetSource has comma then nugetKey too and have the same
        // number of elements
        if(this.nugetSource.includes(",") && this.nugetKey.split(",").length !== this.nugetSource.split(",").length){
            crash("nugetSource and nugetKey must have the same number of elements");
        }

        // verify if nugetserverTimeout is a number
        if(!isNaN(this.nugetServerTimeout)){
            this.nugetServerTimeout = parseInt(this.nugetServerTimeout)
        }

        // verify if configuration has valid value
        if(!this.configuration || !/^(Debug|Release)$/.test(this.configuration)){
            crash("configuration must be Debug or Release");
        }
    }

    main() {
        if(this.isDirectory) {

            var projects = readdirSync(this.target).filter(fn => /\.csproj$/.test(fn))
            
            // verify if target is a directory with csproj files
            if(projects.length > 0){
                
                // run publishPackage every project
                projects.forEach(project => {
                    this.publishPackage(project)
                });
                
                // set the number of found packages
                setOutput("FOUND_PACKAGES", projects.length);

            }else{
                crash("not found any project from target directory");
            }
        }else if(this.targetIsCustomList){
            // publish every project in the list reading from target file
            let items = readFileSync(this.target, UTF8_ENCODING).split(EOL);
            
            if(projects.length === 0){
                crash("empty target file");
            }

            items.forEach(project => {
                this.publishPackage(project);
            });

            // set the number of found packages
            setOutput("FOUND_PACKAGES", items.length);

        } else {
            // check for existing project
            if(!existsSync(this.target))
                crash("project file not found");

            // publish package through single file
            this.publishPackage(this.target);
            setOutput("FOUND_PACKAGES", 1);
        }
    }

    // report the number of success packages
    // put new git tag if tag is set
    report() {
        setOutput("PUSHED_PACKAGES", this.successPackages);

        // tag the git repository if all packages is succesufully published and TAG_COMMIT is true
        if (this.tag !== "" && this.successPackages === this.foundPackages) {
            gitTag(tag);
        }
    }

    // publish a single package base path of .csproj file
    publishPackage(fileProject) {
        // read text from project file
        const fileContent = readFileSync(fileProject, {encoding: "utf-8"});

        // check if file content contains term: <IsPackaged>false</IsPackaged>
        if(fileContent.indexOf("<IsPackaged>false</IsPackaged>") > -1) 
        {
            console.log(`found <IsPackaged>false</IsPackaged> in ${fileProject}`);
            console.log(`skip package ${fileProject}`);
            // skip publish
            return;
        }

        // logs
        console.log(`Project Filepath: ${fileProject}`);
        console.log(`Version Regex: ${this.versionRegex}`);
        console.log(`Name Regex: ${this.nameRegex}`);
        
        // extract version and name from project file
        let parsedVersion = this.versionRegex.exec(fileContent);
        let parsedName = this.nameRegex.exec(fileContent);

        // check if version and name is found
        if (!parsedVersion)
            printErr("unable to extract version!");
        if (!this.nameRegex)
            printErr("unable to extract name!");

        // get version and name
        let version = parsedVersion[1];
        let name = parsedName[1];

        // check if version and name is valid and push project
        this.checkAndPush(fileProject, version, name);

        // logs
        console.log(`Version: ${version}`);
        console.log(`Name: ${version}`);
    }

    // check if version and name is valid and push project
    checkAndPush(projectPath, packageName, version) {

        // check for updates
        get(`${this.nugetSource}/v3-flatcontainer/${packageName}/index.json`, res => {
            let body = new String;

            // if response is 404 then package not found then push
            if (res.statusCode == 404)
                this.pushPackage(projectPath, this.nugetKey, this.nugetSource);

            // if response is 200 then check for version
            if (res.statusCode == 200) {
                res.setEncoding(UTF8_ENCODING);
                res.on("data", chunk => body += chunk);
                res.on("end", () => {
                    
                    // parse and find latest version
                    const parsedBody = JSON.parse(body);

                    // check and call push
                    if (parsedBody.versions.indexOf(version) < LowVersion)
                    {
                        console.log(`found version ${version}`);
                        console.log(`push package ${packageName}`);
                        this.pushPackage(projectPath, this.nugetKey, this.nugetSource);
                    }
                });
            }
        }).on("error", e => {
            // show error
            printErr(`error: ${e.message}`);
        });
    }

    // push package to nuget
    // using an income project, version, name and nuget credentials
    // this method will create a nuget package and push it to nuget
    pushPackage(project, nugetKey, nugetSource) {
        // check if nuget key is set
        if (!nugetKey) {
            warn("NUGET_KEY not given")
        }

        console.log(`NuGet Source: ${nugetSource}`)

        // check if exists old nuGet package
        readdirSync(".")
        .filter(fn => /\.s?nupkg$/.test(fn))
        .forEach(fn => unlinkSync(fn));

        // run dotnet commands to compile and pack using many parameters 
        // from the project file and action inputs
        runProcess(`dotnet build --configuration ${this.configuration} ${project} -property:Platform=${this.platform}`)
        runProcess(`dotnet pack ${this.includeSymbols ? "--include-symbols -property:SymbolPackageFormat=snupkg" : ""} -property:NuspecFile=${this.nuspecFile} --no-build --nologo --configuration ${this.configuration} ${project} -property:Platform=${this.platform} --output .`)

        // get all nupkg files and push them
        const packages = readdirSync(".").filter(fn => fn.endsWith("nupkg"))
        console.log(`Generated Package(s): ${packages.join(", ")}`)

        // detect github host
        // pre-procesing nuget source server location
        // - detecting multiples host separated by comma
        if(nugetSource.indexOf(",") > -1){
            const hosts = nugetSource.split(",");
            const nugetKeys = nugetKey.split(",");
            hosts.forEach((host, i, all) => {
                usesNugetCommandToPush(host, nugetKeys[i]);
            });
        }else{
            // single host
            usesNugetCommandToPush(nugetSource, nugetKey);
        }

        // final check if package was pushed
        if (/error/.test(pushOutput))
            crash(`${/error.*/.exec(pushOutput)[0]}`);
        else
            this.successPackages++;

        // shortcut to publish package with every host avaliable in nuget source option
        function usesNugetCommandToPush(currentNugetSource, currentKey) {
            const nuGetAddress = currentNugetSource.indexOf("nuget.pkg.github.com") !== -1 ? `${currentNugetSource}` : `${currentNugetSource}/v3`;
            const pushCmd = `dotnet nuget push *.nupkg --source ${nuGetAddress}/index.json ` +
            `-k ${currentKey} --skip-duplicate ${!this.includeSymbols ? "-n" : ""} ${this.nugetServerTimeout !== DEFAULT_TIME_INPUT_VALUE ? `--timeout ${this.nugetServerTimeout}` : ""}`,
             pushOutput = runCommand(pushCmd, { encoding: "utf-8" }).stdout;
            return pushOutput;
        }
    }
}

// execute action
const action = new Action();

// usage actions input
action.init();
// execute action
action.main();
// export variable SUCCESS_PACKAGES
action.report();