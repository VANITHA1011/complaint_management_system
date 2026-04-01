from django.urls import path
from . import views

urlpatterns = [
    path("submit/", views.submit_complaint, name="submit_complaint"),
    path("list/", views.list_complaints, name="list_complaints"),
    path("dashboard/", views.dashboard_stats, name="dashboard_stats"),
    path("feedback/submit/", views.submit_feedback, name="submit_feedback"),
    path("feedback/list/", views.list_feedbacks, name="list_feedbacks"),
    path("images/", views.get_complaint_images, name="get_complaint_images"),
    path("<int:complaint_id>/", views.get_complaint, name="get_complaint"),
    path("<int:complaint_id>/edit/", views.edit_complaint, name="edit_complaint"),
    path("<int:complaint_id>/escalate/", views.manual_escalate, name="manual_escalate"),
    path("<int:complaint_id>/resolve/", views.resolve_complaint, name="resolve_complaint"),
    path("<int:complaint_id>/accept/", views.accept_resolution, name="accept_resolution"),
    path("<int:complaint_id>/delete/", views.delete_complaint, name="delete_complaint"),
]
