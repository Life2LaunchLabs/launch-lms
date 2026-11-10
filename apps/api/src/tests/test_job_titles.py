import pytest

from src.services.life_plans.titles import singular_title


@pytest.mark.parametrize("plural,singular", [
    ("Baristas", "Barista"),
    ("Registered Nurses", "Registered Nurse"),
    ("Secretaries and Administrative Assistants, Except Legal, Medical, and Executive", "Secretary or Administrative Assistant, Except Legal, Medical, and Executive"),
    ("Waiters and Waitresses", "Waiter or Waitress"),
    ("Coaches and Scouts", "Coach or Scout"),
    ("Police and Sheriff's Patrol Officers", "Police and Sheriff's Patrol Officer"),
    ("Child, Family, and School Social Workers", "Child, Family, and School Social Worker"),
    ("First-Line Supervisors of Food Preparation and Serving Workers", "First-Line Supervisor of Food Preparation and Serving Workers"),
    ("Inspectors, Testers, Sorters, Samplers, and Weighers", "Inspector, Tester, Sorter, Sampler, or Weigher"),
    ("Heating, Air Conditioning, and Refrigeration Mechanics and Installers", "Heating, Air Conditioning, and Refrigeration Mechanic or Installer"),
    ("Janitors and Cleaners, Except Maids and Housekeeping Cleaners", "Janitor or Cleaner, Except Maids and Housekeeping Cleaners"),
    ("Teachers and Instructors, All Other", "Teacher or Instructor, All Other"),
    ("Fine Artists, Including Painters, Sculptors, and Illustrators", "Fine Artist, Including Painters, Sculptors, and Illustrators"),
    ("Bus and Truck Mechanics and Diesel Engine Specialists", "Bus and Truck Mechanic or Diesel Engine Specialist"),
    ("Attorneys", "Attorney"),
    ("Lawyers", "Lawyer"),
    ("Electrician", "Electrician"),
    ("Emergency Medical Technician", "Emergency Medical Technician"),
    ("Chief Executives", "Chief Executive"),
    ("Nurse Midwives", "Nurse Midwife"),
    ("Customer Service Representatives", "Customer Service Representative"),
    ("Detectives and Criminal Investigators", "Detective or Criminal Investigator"),
    ("Agents and Business Managers of Artists, Performers, and Athletes", "Agent or Business Manager of Artists, Performers, and Athletes"),
    ("", ""),
])
def test_singular_title(plural, singular):
    assert singular_title(plural) == singular
    assert singular_title(singular) == singular
