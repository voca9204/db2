## DB2 NAS Git 설정 (2025-05-17)

### Git 설정 목록
```
core.repositoryformatversion=0
core.filemode=true
core.bare=false
core.logallrefupdates=true
core.ignorecase=true
core.precomposeunicode=true
remote.nas.url=ssh://skylar@skylar.synology.me:229/var/services/homes/skylar/git/db2.git
remote.nas.fetch=+refs/heads/*:refs/remotes/nas/*
branch.main.remote=nas
branch.main.merge=refs/heads/main
user.name=skylar
user.email=skylar@synology.me
```

### 원격 저장소
```
nas	ssh://skylar@skylar.synology.me:229/var/services/homes/skylar/git/db2.git (fetch)
nas	ssh://skylar@skylar.synology.me:229/var/services/homes/skylar/git/db2.git (push)
```

### 브랜치 정보
```
* main fd5a800 [nas/main] Add website files for deployment
```