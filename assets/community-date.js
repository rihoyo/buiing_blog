const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
export function modifiedDate(value){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':formatter.format(date)}
