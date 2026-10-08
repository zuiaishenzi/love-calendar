package xyz.ourdays.mobile;
import android.app.job.JobService;
import android.app.job.JobParameters;
public final class NotificationJob extends JobService {
 @Override public boolean onStartJob(JobParameters params){AppNotifications.poll(this,()->jobFinished(params,false));return true;}
 @Override public boolean onStopJob(JobParameters params){return false;}
}
