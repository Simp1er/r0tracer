function uniqBy(array, key) {
    var seen = {};
    return array.filter(function (item) {
        var k = key(item);
        return seen.hasOwnProperty(k) ? false : (seen[k] = true);
    });
}
function hasOwnProperty(obj, name) {
    try {
        return obj.hasOwnProperty(name) || name in obj;
    } catch (e) {
        return obj.hasOwnProperty(name);
    }
}
function getHandle(object) {
    if (hasOwnProperty(object, '$handle')) {
        if (object.$handle != undefined) {
            return object.$handle;
        }
    }
    if (hasOwnProperty(object, '$h')) {
        if (object.$h != undefined) {
            return object.$h;
        }
    }
    return null;
}
//查看域值
function inspectObject(obj, input) {
    var isInstance = false;
    var obj_class = null;
    if (getHandle(obj) === null) {
        obj_class = obj.class;
    } else {
        var Class = Java.use("java.lang.Class");
        obj_class = Java.cast(obj.getClass(), Class);
        isInstance = true;
    }
    input = input.concat("Inspecting Fields: => ", isInstance, " => ", obj_class.toString());
    input = input.concat("\r\n")
    var fields = obj_class.getDeclaredFields();
    for (var i in fields) {
        if (isInstance || Boolean(fields[i].toString().indexOf("static ") >= 0)) {
            // output = output.concat("\t\t static static static " + fields[i].toString());
            var className = obj_class.toString().trim().split(" ")[1];
            // console.log("className is => ",className);
            var fieldName = fields[i].toString().split(className.concat(".")).pop();
            var fieldType = fields[i].toString().split(" ").slice(-2)[0];
            var fieldValue = undefined;
            if (!(obj[fieldName] === undefined))
                fieldValue = obj[fieldName].value;
            input = input.concat(fieldType + " \t" + fieldName + " => ", fieldValue + " => ", JSON.stringify(fieldValue));
            input = input.concat("\r\n")
        }
    }
    return input;
}

// trace单个类的所有静态和实例方法包括构造方法 trace a specific Java Method
function traceMethod(targetClassMethod) {
    var delim = targetClassMethod.lastIndexOf(".");
    if (delim === -1) return;
    var targetClass = targetClassMethod.slice(0, delim)
    var targetMethod = targetClassMethod.slice(delim + 1, targetClassMethod.length)
    var hook = Java.use(targetClass);
    var overloadCount = hook[targetMethod].overloads.length;
    console.log("Tracing Method : " + targetClassMethod + " [" + overloadCount + " overload(s)]");
    for (var i = 0; i < overloadCount; i++) {
        hook[targetMethod].overloads[i].implementation = function () {
            //初始化输出
            var output = "";
            //画个横线
            for (var p = 0; p < 100; p++) {
                output = output.concat("==");
            }
            output = output.concat("\r\n")
            //域值
            output = inspectObject(this, output);
            //进入函数
            output = output.concat("\n*** entered " + targetClassMethod);
            output = output.concat("\r\n")
            if (arguments.length) console.log();
            //参数
            for (var j = 0; j < arguments.length; j++) {
                output = output.concat("arg[" + j + "]: " + arguments[j] + " => " + JSON.stringify(arguments[j]));
                output = output.concat("\r\n")
            }
            //调用栈
            output = output.concat(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Throwable").$new()));
            output = output.concat("\r\n")
            var retval = this[targetMethod].apply(this, arguments);
            //返回值
            output = output.concat("\nretval: " + retval + " => " + JSON.stringify(retval));
            output = output.concat("\r\n")
            // inspectObject(this)   
            //离开函数
            output = output.concat("\n*** exiting " + targetClassMethod);
            output = output.concat("\r\n")
            //最终输出
            console.log(output);
            return retval;
        }
    }
}

function traceClass(targetClass) {
    //Java.use是新建一个对象哈，大家还记得么？
    var hook = Java.use(targetClass);
    //利用反射的方式，拿到当前类的所有方法
    var methods = hook.class.getDeclaredMethods();    
    //建完对象之后记得将对象释放掉哈
    hook.$dispose;
    //将方法名保存到数组中
    var parsedMethods = [];
    var output = "";    
    output = output.concat("\tSpec: => \r\n")
    methods.forEach(function (method) {
        output = output.concat(method.toString())
        output = output.concat("\r\n")
        parsedMethods.push(method.toString().replace(targetClass + ".", "TOKEN").match(/\sTOKEN(.*)\(/)[1]);
    });
    //去掉一些重复的值
    var Targets = uniqBy(parsedMethods, JSON.stringify);
    // targets = [];
    var constructors = hook.class.getDeclaredConstructors();
    if (constructors.length > 0) {
        constructors.forEach(function (constructor) {
            output = output.concat("Tracing ", constructor.toString())
            output = output.concat("\r\n")
        })
        Targets = Targets.concat("$init")
    }
    //对数组中所有的方法进行hook，
    Targets.forEach(function (targetMethod) {
        traceMethod(targetClass + "." + targetMethod);
    });
    //画个横线
    for (var p = 0; p < 100; p++) {
        output = output.concat("+");
    }
    console.warn(output);
}
function hook(white, black, target = null) {
    console.log("start")
    if (!(target === null)) {
        console.warn("Begin enumerateClassLoaders ...")
        Java.enumerateClassLoaders({
            onMatch: function (loader) {
                try {
                    if (loader.findClass(target)) {
                        console.log("Successfully found loader")
                        console.log(loader);
                        Java.classFactory.loader = loader;
                        console.log("Switch Classloader Successfully ! ")
                    }
                }
                catch (error) {
                    console.log(" continuing :" + error)
                }
            },
            onComplete: function () {
                console.log("EnumerateClassloader END")
            }
        })
    }
    console.warn("Begin Search Class...")
    var targetClasses = new Array();
    Java.enumerateLoadedClasses({
        onMatch: function (className) {
            if (className.toString().indexOf(white) >= 0 &&
                className.toString().indexOf(black) < 0
            ) {
                console.log("Found Class => ", className)
                targetClasses.push(className);
                traceClass(className);
            }
        }, onComplete: function () {
            console.log("Search Class Completed!")
        }
    })
    var output = "On Total Tracing :"+String(targetClasses.length)+" classes :\r\n";
    targetClasses.forEach(function(target){
        output = output.concat(target);
        output = output.concat("\r\n")        
    })
    console.warn(output+"Start Tracing ...")
}
function main() {
    Java.perform(function () {
        //A. trace单个函数
        // traceClass("java.lang.String")
        //B. trace多个函数
        hook("javax.crypto.Cipher", "$", "javax.crypto.Cipher");
        
        //C. 
    })
}
/*
//setImmediate是立即执行函数，setTimeout是等待毫秒后延迟执行函数
//二者在attach模式下没有区别
//在spawn模式下，hook系统API时如javax.crypto.Cipher建议使用setImmediate立即执行，不需要延时
//在spawn模式下，hook应用自己的函数或含壳时，建议使用setImmediate并给出适当的延时(500~5000)
*/
setImmediate(main)
//
// setTimeout(main, 2000);


// 玄而又玄，众妙之门
// 勤于换版本