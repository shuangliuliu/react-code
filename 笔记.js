/**
*ReactDom渲染
* 一、调用render方法
* 二、调用legacyRenderSubtreeIntoContainer( null, element,  container, false, callback)，将子树渲染到容器中
    2.1、创建root节点（就是ReactRoot）调用legacyCreateRootFromDOMContainer()
    2.2、调用root.render方法开始渲染
      1、开始更新container，updateContainer()
        1、updateContainerAtExpirationTime()
          1、scheduleRootUpdate()
            1、创建update,createUpdate(expirationTime)
            2、将update加入updateQueue,enqueueUpdate(current, update)
              1、首先创建一个updateQueue，赋值给当前的fiber对象，调用createUpdateQueue(fiber.memoizedState)
              2、将update加入到更新队列中,调用appendUpdateToQueue(queue1, update)
            3、进入任务调度,scheduleWork(current, expirationTime)，任务调度开始
*/