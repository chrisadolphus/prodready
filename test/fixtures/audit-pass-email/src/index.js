import nodemailer from 'nodemailer';

export function send() {
  return nodemailer.createTransport({ host: 'smtp.example.com' });
}
