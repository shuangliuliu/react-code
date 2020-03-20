/*
一、进入任务调度, scheduleWork(current, expirationTime)
1.1 首先修改了fiber对象的过期时间,同时返回当前fiber对象的stateNode，const root = scheduleWorkToRoot(fiber, expirationTime)
1.2 给root添加了root.nextExpirationTimeToWorkOn = expirationTime，markPendingPriorityLevel(root, expirationTime)
1.3 requestWork
*/