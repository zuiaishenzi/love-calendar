import nodemailer from 'nodemailer';

export function createMailer(env=process.env) {
 const ready=Boolean(env.QQ_SMTP_USER && env.QQ_SMTP_AUTH_CODE);
 const transporter=ready?nodemailer.createTransport({host:'smtp.qq.com',port:465,secure:true,
  auth:{user:env.QQ_SMTP_USER,pass:env.QQ_SMTP_AUTH_CODE},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000}):null;
 return {ready,async send({to,subject,text}) {
  if(!transporter)throw new Error('服务器尚未配置QQ发件邮箱');
  const result=await transporter.sendMail({from:env.QQ_SMTP_USER,to,subject,text,disableFileAccess:true,disableUrlAccess:true});
  if(!result.accepted?.length)throw new Error('邮件未被接收');
 }};
}
export function verificationMessage(email,code){return {to:email,subject:code,text:code};}
