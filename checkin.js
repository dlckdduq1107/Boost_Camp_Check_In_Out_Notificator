//따로 파일을 생성하여 정보를 가져와야 한다.(발급받은 토큰 번호, 가져올 스레드가 몇번째인지, 메시지보낼채널의 이름, 정보를 가져올 채널의 이름)
const {token,lastest,channelForSend,checkInChannel} = require("./privateOrSettingData");

// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const { WebClient, LogLevel } = require("@slack/web-api");

// WebClient insantiates a client that can call API methods
// When using Bolt, you can use either `app.client` or the `client` passed to listeners.

const client = new WebClient(token, {
  // LogLevel can be imported and used to make debugging simpler
  logLevel: LogLevel.DEBUG
});


/////////////여기까지는 슬랙api와의 연동////////////


// You probably want to use a database to store any conversations information ;)
let conversationsStore = {};//체크인 채널 정보 객체

async function populateConversationStore() {//채널 탐색
  try {
    // Call the conversations.list method using the WebClient
    const result = await client.conversations.list();//모든 채널의 정보 get
    

    saveConversations(result.channels);//채널에 해당하는 정보를 넘겨줌
  }
  catch (error) {
    console.error(error);
  }
}

let channelID;//체크인 채널 아이디
let sendChannelID;//메세지 보낼 채널 아이디
// Put conversations into the JavaScript object
function saveConversations(conversationsArray) {//원하는 채널 id를 get
  let conversationId = '';
  
  conversationsArray.forEach(function(conversation){//모든 채널을 돌면서
    if(conversation["name"] === channelForSend){//메시지를 보낼채널 id저장
        sendChannelID = conversation["id"];
    }
    // Key conversation info on its unique ID
    if(conversation["name"] === checkInChannel){//체크인 채널 id저장
        conversationId = conversation["id"];
        
        // Store the entire conversation object (you may not need all of the info)
        conversationsStore[conversationId] = conversation;
        channelID = conversationId;//체크인 채널 id저장
    }
    
  });
  console.log(conversationsStore);
  
}


let conversationHistory;//해당 채널의 모든 스레드 정보 저장
async function history(id){
    // Store conversation history
    
    // ID of channel you watch to fetch the history for
    let channelId = id;//채널 아이디 매핑

    try {
    // Call the conversations.history method using WebClient
    const result = await client.conversations.history({
        channel: channelId
    });

    conversationHistory = result.messages;//모든 스레드 저장

    // Print results
    console.log(conversationHistory.length + " messages found in " + channelId);
    }
    catch (error) {
    console.error(error);
    }
}



let usersStore = {};//유저 코드 : J~이름
let resultUser = {};//유저별 값 저장(체크인 안했으면 0 했으면 1)
async function getName(){//유저코드에 해당하는 실제 이름을 저장하는 역할
    // You probably want to use a database to store any user information ;)
    try {
        // Call the users.list method using the WebClient(프로젝트의 유저 리스트를 불러온다.)
        const result = await client.users.list();

        saveUsers(result.members);//유저 정보 저장
    }
    catch (error) {
        console.error(error);
    }

    
// Put users into the JavaScript object
    function saveUsers(usersArray) {
        let userId = '';
        let realName = '';
        let re = /^[a-zA-Z][0-9]{1,3}/;//유저 이름에 대한 정규식
        usersArray.forEach(function(user){//유저 정보를 돌면서
            // Key user info on their unique user ID
            userId = user["id"];
            realName = user["profile"]["display_name"];
            if(re.test(realName)){
                // Store the entire user object (you may not need all of the info)
                usersStore[userId] = realName;//id : 실제이름 매칭
                resultUser[userId] = 0;//체크인 결과 객체에 초기화
                
            }
            
        });

    }
}

let notCheckList;//체크인 하지 않은 인원 목록
const check = async function (){//특정스레드에 댓글을 달지 않은 인원을 리스트에 넣어줌
    try {
        let threadNum = conversationHistory[lastest]["ts"];//체크인 채널의 가장 첫번째 스레드 넘버
        const reply = await client.conversations.replies({//reply에 스레드에 대한 답글 정보 저장
                                    channel:channelID,
                                    ts:threadNum,
                                    limit:400
                                });

        let coment = reply["messages"];//답글 리스트 저장
        coment.forEach((val)=>{//모든 답글 탐색
            let nameCode = val["user"];//유저코드 번호
            if(nameCode in usersStore){//유저 코드번호가 있으면
                resultUser[nameCode] = 1;//체크인 결과 객체값을 1로
            }
        });

        notCheckList = Object.keys(resultUser).map((key)=>{//체크인 결과 객체를 돌면서
                        if(resultUser[key] === 0){//해당 값이 0이면 체크인 하지 않음
                            return key;//해당 유저 코드 리턴
                        }
                        else{//체크인 한 경우
                            return "";
                        }
                    });
        notCheckList = notCheckList.filter((val)=>val);//체크인 하지 않은 코드만 필터링
        //console.log();
    }
    catch (error) {
    console.error(error);
    }
}

//채널에 메시지 보내기
const sendMessage = async function(){

    let time = new Date();
    let inOut;
    (time.getHours() < 12)? inOut="체크인":inOut="체크아웃";
    let day = `${time.getFullYear()}년 ${time.getMonth()+1}월 ${time.getDate()}일의  ${inOut}현황\n`
    try {
    // Call the chat.postMessage method using the WebClient
        const result = await client.chat.postMessage({//해당 채널에 메시지 보내기
            channel: sendChannelID,
            text: `\n\n${day}\n<@${notCheckList.join(">\n<@")}>님 ${inOut} 시간이 얼마 남지 않았습니다.\n\n\n`,//@로 언급해서 보내기
            link_names : true
        });
        console.log(result)
    }
    catch (error) {
        console.error(error);
    }
}

const exe = async function(){
    //getName은 다른 동작과 관련이 없으므로 비동기로 동작
    const setNameList = getName();//유저정보 저장
    const getChannel = await populateConversationStore();//채널 정보 저장
    const his = await history(channelID);//스레드 구하기
    const ch = await check();//체크인 하지 않은 사람 리스트 생성
    const send = await sendMessage();//리스트를 문자열로 만들어 채널에 메시지 보내기
}

exe();